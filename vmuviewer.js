'use strict';

document.addEventListener('DOMContentLoaded', function() {
    new WebController(document.querySelector("main"));
});

function showError(msg) {
    console.error(msg);
}

function WebController(container) {
    const button = container.querySelector("#addViewer");
    button.addEventListener("click", function(event) {
        new VMUViewerController(container);
    });
    new VMUViewerController(container);

    this.registerServiceWorker();

    document.addEventListener("dragover", function(event) {
        // console.log("[WebController] dragover " + event.dataTransfer.types);
        if (event.dataTransfer.types.includes("Files")) {
            event.dataTransfer.dropEffect = "copy";
            event.preventDefault();
        }
    });

    document.addEventListener("drop", function(event) {
        console.log("[WebController] Drop " + event.dataTransfer.types);

        event.preventDefault();

        let shouldSkipFirst = event.defaultPrevented;
        for (const element of event.dataTransfer.items) {
            if (element.kind === "file") {
                if (shouldSkipFirst) shouldSkipFirst = false;
                else {
                    var file = element.getAsFile();
                    console.log("[File] " + file.name);
                    const controller = new VMUViewerController(container);
                    controller.readFile(file);
                }
            }
        }
    });
}

WebController.prototype.registerServiceWorker = function() {
    if (!navigator.serviceWorker) return;

    const currentFolder = location.pathname.substring(0, location.pathname.lastIndexOf("/"));
    const swFile = currentFolder + "/sw.js";

    const controller = this;
    navigator.serviceWorker.register(swFile).then(function(reg) {
        console.log("ServiceWorker Registered");
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", function(event) {
            console.log("Controller Change!");
            if (!reloading) window.location.reload();
            reloading = true;
        });

    });
}

/* Source: https://stackoverflow.com/questions/23451726/saving-binary-data-as-file-using-javascript-from-a-browser
 * Two options
 * 1. Get FileSaver.js from here
 *     https://github.com/eligrey/FileSaver.js/blob/master/FileSaver.min.js -->
 *     <script src="FileSaver.min.js" />
 *
 * Or
 *
 * 2. If you want to support only modern browsers like Chrome, Edge, Firefox, etc.,
 *    then a simple implementation of saveAs function can be:
 */
function saveAs(blob, fileName) {
    var url = window.URL.createObjectURL(blob);

    var anchorElem = document.createElement("a");
    anchorElem.style = "display: none";
    anchorElem.href = url;
    anchorElem.download = fileName;

    document.body.appendChild(anchorElem);
    anchorElem.click();

    document.body.removeChild(anchorElem);

    // On Edge, revokeObjectURL should be called only after
    // a.click() has completed, atleast on EdgeHTML 15.15048
    setTimeout(function() {
        window.URL.revokeObjectURL(url);
    }, 1000);
}

VMUViewerController.prototype.DEFAULT_DOWNLOAD_FILENAME = "vmu.bin";
VMUViewerController.prototype.DRAG_AND_DROP_TYPE = "mcard/dcvmu";

function VMUViewerController(container) {
    console.log("Loading VMU Viewer Controller: " + getNodePath(container));
    const controller = this;

    // Clone template and add it to container
    const viewerTemplate = container.querySelector("#vmuviewer");
    const viewer = document.importNode(viewerTemplate.content, true);
    container.appendChild(viewer);

    // Work over clonned template, that will be container.lastElementChild
    this.container = container.lastElementChild;
    this.timers = [];
    this.table = this.container.querySelector(".elements");
    this.mcard = new VMU();
    this.fileName = this.DEFAULT_DOWNLOAD_FILENAME;

    this.container.addEventListener("dragover", function (event) {
        // console.log("[VMUViewerController] dragover " + event.dataTransfer.types);

        if ((event.dataTransfer.types.includes(controller.DRAG_AND_DROP_TYPE) && VMUViewerController.prototype.transferObject.mcard != controller.mcard)
             || event.dataTransfer.types.includes("Files")) {
            event.dataTransfer.dropEffect = "copy";
            event.preventDefault();
        }
    });

    this.container.addEventListener("drop",  function (event) {
        console.log("[Drop] Current target ID: " + event.currentTarget.id);
        console.log("[Drop] Current target node: " + event.currentTarget.nodeName);
        console.log("[Drop] Target node: " + event.target.nodeName);
        console.log("[Drop] " + event.dataTransfer.types);

        if (event.dataTransfer.types.includes(controller.DRAG_AND_DROP_TYPE)) {
            const directory = VMUViewerController.prototype.transferObject;

            if (controller.mcard == directory.mcard) {
                console.log("Copy to the same memory card");
            }

            controller.mcard.copyDirectoryEntry(directory);
            controller.resetState();
            controller.displayData();

        }
        else if (event.dataTransfer.items.length > 0) { // Files
            const firstFile = event.dataTransfer.items[0].getAsFile();
            console.log("[File] " + firstFile.name);
            controller.readFile(firstFile);

            if (event.dataTransfer.items.length == 1) event.stopPropagation();
        }
        event.preventDefault();
    });

    const filesInput = this.container.querySelector(".file");
    filesInput.addEventListener("input", function(event){
        const file = event.target.files[0];
        controller.readFile(file);
    });

    const download = this.container.querySelector(".download");
    download.addEventListener("click", function(event){
        saveAs(new Blob([controller.mcard.arrayBuffer], {type: 'application/octet-stream'}), controller.fileName);
    });

    window.onerror = function(message, file, line, col, error) {
        showError(message);
    }

    this.drawMemoryCard();
}

VMUViewerController.prototype.transferObject = null;

VMUViewerController.prototype.resetState = function() {
    // Clear timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];

    // Clear table:
    while (this.table.rows.length > 1) {
        this.table.deleteRow(-1);
    }

    // Draw the VMU schema
    this.drawMemoryCard();
}


VMUViewerController.prototype.readFile = function(file) {
    console.log("Read file: " + file.name + " (" + file.size + " bytes)");

    this.resetState();

    const controller = this;
    const fileReader = new FileReader();
    fileReader.onload = function(event) {
        controller.fileName = file.name;
        controller.parseArrayBuffer(event.target.result);
    };
    fileReader.readAsArrayBuffer(file);
}

const VMU_CANVAS_BLOCKS_PER_COLUMN = 16;
const VMU_CANVAS_BLOCK_SIZE = 32;
const VMU_CANVAS_BLOCK_MARGIN = 1;
const VMU_CANVAS_BLOCK_BORDER = 1;
const VMU_CANVAS_FULL_BLOCK_SIZE = VMU_CANVAS_BLOCK_SIZE + VMU_CANVAS_BLOCK_MARGIN*2 + VMU_CANVAS_BLOCK_BORDER*2;

VMUViewerController.prototype.parseArrayBuffer = function(arrayBuffer) {
    this.mcard.parseArrayBuffer(arrayBuffer);
    this.displayData();
}

VMUViewerController.prototype.displayData = function() {
    const controller = this;
    this.mcard.entries.forEach(function(directoryEntry) {
        controller.displayDirectoryEntry(directoryEntry, controller.table);
    });
}

VMUViewerController.prototype.displayDirectoryEntry = function(directory, table) {
    console.log("[" + pad(directory.type[0].toString(16), 2) + "] Filename: " + directory.getFileName() + " [" + directory.size[0] + " blocks][First " + directory.firstBlock[0] + "+" + directory.headerOffset[0] + "]");
    const controller = this;

    // hexdump(new Uint8Array(arrayBuffer), directory.firstBlock[0]);
    const row = table.insertRow();
    row.draggable = true;
    row.addEventListener("dragstart", function(event) {
        console.log("[Drag start]");
        VMUViewerController.prototype.transferObject = directory;
        event.dataTransfer.setData(controller.DRAG_AND_DROP_TYPE, null);
    });

    row.addEventListener("dragend", function(event) {
        console.log("[Drag end] Event dropEffect: " + event.dataTransfer.dropEffect);
        VMUViewerController.prototype.transferObject = null;
    });

    // Name
    let newCell = row.insertCell();
    let cellText = document.createTextNode(directory.getFileName());
    newCell.appendChild(cellText);

    // Timestamp
    newCell = row.insertCell();
    cellText = document.createTextNode(directory.getTimeStamp().toLocaleDateString("es-ES", { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' , hour: '2-digit', minute: '2-digit', second: '2-digit'}));
    newCell.appendChild(cellText);

    // Size
    newCell = row.insertCell();
    cellText = document.createTextNode(directory.size[0] + "/" + this.mcard.verifyFATChain(directory.firstBlock[0]));
    newCell.appendChild(cellText);

    // First block + offset
    newCell = row.insertCell();
    cellText = document.createTextNode(directory.firstBlock[0] + "+" + directory.headerOffset[0]);
    newCell.appendChild(cellText);

    /* Read content */
    const contentHeader = directory.getContent();

     // VM Desc
    newCell = row.insertCell();
    cellText = document.createTextNode(contentHeader.getVMSDescription());
    newCell.appendChild(cellText);

    // Boot Desc
    newCell = row.insertCell();
    cellText = document.createTextNode(contentHeader.getBootDescription());
    newCell.appendChild(cellText);

    // Num Icons
    newCell = row.insertCell();
    cellText = document.createTextNode(contentHeader.numIcons[0]);
    newCell.appendChild(cellText);

    // Eyecatch Type
    newCell = row.insertCell();
    cellText = document.createTextNode(contentHeader.animationSpeed[0]);
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    let canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    canvas.style.border = "1px solid";

    contentHeader.currentFrame = 0;
    drawIcon(canvas, contentHeader.getIconBitmap(contentHeader.currentFrame), contentHeader.iconPalette);

    if (contentHeader.frameIntervalInMs() > 0) {
        const timer = setInterval(function drawInterval() {
            contentHeader.currentFrame = (contentHeader.currentFrame + 1)%contentHeader.numIcons[0];
            drawIcon(canvas, contentHeader.getIconBitmap(contentHeader.currentFrame), contentHeader.iconPalette);
        }, contentHeader.frameIntervalInMs());
        this.timers.push(timer);
    }

    newCell.appendChild(canvas);

    newCell = row.insertCell();
    cellText = document.createTextNode("✖");
    newCell.addEventListener("click", function(event) {
        console.log("Delete");
        directory.mcard.deleteDirectoryEntry(directory);
        controller.resetState();
        controller.displayData();

    });
    newCell.appendChild(cellText);


    /* Fill memory card */
    let dataBlockIterator = directory.firstBlock[0];
    for (let idx = 0; idx < directory.size[0]; ++idx) {
        this.drawMemoryCardBlockIcon(dataBlockIterator, contentHeader.getIconBitmap(contentHeader.currentFrame), contentHeader.iconPalette);
        dataBlockIterator = this.mcard.getNextFATBlock(dataBlockIterator);
    }
}


VMUViewerController.prototype.drawMemoryCard = function() {
    const canvas = this.container.querySelector(".memorycard")

    canvas.width = VMU_CANVAS_FULL_BLOCK_SIZE*VMU_CANVAS_BLOCKS_PER_COLUMN;
    canvas.height = VMU_CANVAS_FULL_BLOCK_SIZE*(TOTAL_BLOCKS/VMU_CANVAS_BLOCKS_PER_COLUMN);
    canvas.style.border = "1px solid";

    // console.log("Canvas: " + canvas.width + "x" + canvas.height);

    var ctx = canvas.getContext("2d");
    for (let idx = 0; idx < TOTAL_BLOCKS; ++idx)
        this.drawMemoryCardBlock(ctx, idx);

}

VMUViewerController.prototype.drawMemoryCardBlockIcon = function(dataBlock, bitmap, palette) {
        const canvas = this.container.querySelector(".memorycard");
        var context = canvas.getContext("2d");

        this.drawMemoryCardBlock(context, dataBlock, bitmap, palette);
}


VMUViewerController.prototype.drawMemoryCardBlock = function(context, blockIdx, bitmap, palette) {
    const row = Math.floor(blockIdx/VMU_CANVAS_BLOCKS_PER_COLUMN);
    const column = blockIdx%VMU_CANVAS_BLOCKS_PER_COLUMN;
    const rowPixel = row*VMU_CANVAS_FULL_BLOCK_SIZE;
    const columnPixel = column*VMU_CANVAS_FULL_BLOCK_SIZE;
    // console.log("Draw block [" + blockIdx + "] = " + row + "x" + column);

    if (VMU_CANVAS_BLOCK_BORDER > 0) {
        context.fillStyle = 'black';
        context.fillRect(columnPixel + VMU_CANVAS_BLOCK_MARGIN,
                         rowPixel + VMU_CANVAS_BLOCK_MARGIN,
                         VMU_CANVAS_FULL_BLOCK_SIZE - VMU_CANVAS_BLOCK_MARGIN*2,
                         VMU_CANVAS_FULL_BLOCK_SIZE - VMU_CANVAS_BLOCK_MARGIN*2);
    }

    if (bitmap) {
        drawIconToContext(context, bitmap, palette, columnPixel + VMU_CANVAS_BLOCK_MARGIN + VMU_CANVAS_BLOCK_BORDER, rowPixel + VMU_CANVAS_BLOCK_MARGIN + VMU_CANVAS_BLOCK_BORDER);
    }
    else {
        context.fillStyle = 'white';
        context.fillRect(columnPixel + VMU_CANVAS_BLOCK_MARGIN + VMU_CANVAS_BLOCK_BORDER,
                         rowPixel + VMU_CANVAS_BLOCK_MARGIN + VMU_CANVAS_BLOCK_BORDER,
                         VMU_CANVAS_FULL_BLOCK_SIZE - VMU_CANVAS_BLOCK_MARGIN*2 - VMU_CANVAS_BLOCK_BORDER*2,
                         VMU_CANVAS_FULL_BLOCK_SIZE - VMU_CANVAS_BLOCK_MARGIN*2 - VMU_CANVAS_BLOCK_BORDER*2);
    }
}

/*
Color bits: 4 groups x 4 bits
    | 15  14  13  12 | 11  10  9   8 |  7   6   5   4 |  3   2   1   0 |
    |      Alpha     |      Red      |      Green     |      Blue      |
*/
function paletteToRGBA(palette) {
    return {
        a :            ((palette >> 4*3) & 0xF)/15,
        r : Math.floor(((palette >> 4*2) & 0xF)/15*255),
        g : Math.floor(((palette >> 4*1) & 0xF)/15*255),
        b : Math.floor(((palette >> 4*0) & 0xF)/15*255)
    };
}

function rgbaToStyleStr(rgba) {
    return "rgba(" + rgba.r + ", " + rgba.g + ", " + rgba.b + ", " + rgba.a + ")";
}

function drawIcon(canvas, bitmap, palette) {
    var ctx = canvas.getContext("2d");
    drawIconToContext(ctx, bitmap, palette, 0, 0);
}

const imageCache = new Map();

function drawIconToContext(ctx, bitmap, palette, columnOffset = 0, rowOffset = 0) {
    const cacheKey = bitmap;
    if (!(cacheKey in imageCache)) {
        bitmap.forEach(function(data, index) {
            // 32x32 as nibbles (every byte = 2 pixels)
            const row = Math.floor(index/(32/2));
            const column = (index%(32/2))*2;

            function drawPixel(column, row, pixelMap) {
                const pixelPalette = palette[pixelMap];
                const colors       = paletteToRGBA(pixelPalette);
                const style        = rgbaToStyleStr(colors);
                ctx.fillStyle      = style;
                ctx.fillRect(column, row, 1, 1);
            }

            const leftPixelMap  = (data >> 4) & 0xF;
            const rightPixelMap = data & 0xF;

            drawPixel(columnOffset + column, rowOffset + row, leftPixelMap);
            drawPixel(columnOffset + column + 1, rowOffset + row, rightPixelMap);
        });
        imageCache[cacheKey] = ctx.getImageData(columnOffset, rowOffset, 32, 32);
    }
    else {
        ctx.putImageData(imageCache[cacheKey], columnOffset, rowOffset);
    }
}

function pad(obj, size, ch = "0") {
    var objStr = obj.toString();
    if (size <= objStr.length) return objStr;
    return ch.repeat(size - objStr.length) + objStr;
}

function logNode(node, depth = 0) {
    let string = "[" + depth + "] ";
    for (let currentDepth = 0; currentDepth < depth; ++currentDepth) {
        string += "    ";
    }
    string += node.nodeName;
    if (node.id) string += "@" + node.id;
    if (node.childNodes.length > 0) string += " - " + node.childNodes.length + " children";
    if (node.classList && node.classList.length > 0) string += " - Clases = " + node.classList;
    console.log(string);
    node.childNodes.forEach(child => logNode(child, depth + 1));
}

function getNodePath(node) {
    if (!node) return null;
    let string = node.nodeName;
    if (node.id) string += "@" + node.id;
    const parent = getNodePath(node.parentNode);
    if (parent) string = parent + " > " + string;
    return string;
}
