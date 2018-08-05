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
        new PSXMCViewerController(container);
    });
    new PSXMCViewerController(container);

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
                //if (shouldSkipFirst) shouldSkipFirst = false;
                //else {
                    var file = element.getAsFile();
                    console.log("[File] " + file.name);
                    const controller = new PSXMCViewerController(container);
                    controller.readFile(file);
              //  }
            }
        }
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

PSXMCViewerController.prototype.DEFAULT_DOWNLOAD_FILENAME = "memorycard.srm";
PSXMCViewerController.prototype.DRAG_AND_DROP_TYPE = "mcard/psxmc";

function PSXMCViewerController(container) {
    console.log("Loading PSXMC Viewer Controller: " + getNodePath(container));
    const controller = this;

    // Clone template and add it to container
    const viewerTemplate = container.querySelector("#psxmcviewer");
    const viewer = document.importNode(viewerTemplate.content, true);
    container.appendChild(viewer);

    // Work over clonned template, that will be container.lastElementChild
    this.container = container.lastElementChild;
    this.timers = [];
    this.table = this.container.querySelector(".elements");
    this.mcard = new PSXMC();
    this.fileName = this.DEFAULT_DOWNLOAD_FILENAME;

    this.container.addEventListener("dragover", function (event) {
        // console.log("[PSXMCViewerController] dragover " + event.dataTransfer.types);

        if ((event.dataTransfer.types.includes(controller.DRAG_AND_DROP_TYPE) && PSXMCViewerController.prototype.transferObject.mcard != controller.mcard)
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
            const directory = PSXMCViewerController.prototype.transferObject;

            if (controller.mcard == directory.mcard) {
                console.log("Copy to the same memory card");
            }

            controller.mcard.copyDirectoryEntry(directory);
            controller.resetState();
            controller.displayData();

            // event.stopPropagation();
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

PSXMCViewerController.prototype.transferObject = null;

PSXMCViewerController.prototype.resetState = function() {
    // Clear timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];

    // Clear table:
    while (this.table.rows.length > 1) {
        this.table.deleteRow(-1);
    }

    // Draw the PSXMC schema
    this.drawMemoryCard();
}


PSXMCViewerController.prototype.readFile = function(file) {
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

const PSXMC_CANVAS_BLOCKS_PER_COLUMN = 16;
const PSXMC_CANVAS_BLOCK_SIZE = 16;
const PSXMC_CANVAS_BLOCK_MARGIN = 1;
const PSXMC_CANVAS_BLOCK_BORDER = 1;
const PSXMC_CANVAS_FULL_BLOCK_SIZE = PSXMC_CANVAS_BLOCK_SIZE + PSXMC_CANVAS_BLOCK_MARGIN*2 + PSXMC_CANVAS_BLOCK_BORDER*2;

PSXMCViewerController.prototype.parseArrayBuffer = function(arrayBuffer) {
    this.mcard.parseArrayBuffer(arrayBuffer);
    this.displayData();
}

PSXMCViewerController.prototype.displayData = function() {
    const controller = this;
    this.mcard.entries.forEach(function(directoryEntry) {
        controller.displayDirectoryEntry(directoryEntry, controller.table);
    });
}

PSXMCViewerController.prototype.displayDirectoryEntry = function(directory, table) {
    console.log("Filename: " + directory.getFileName());
    const controller = this;

    // hexdump(new Uint8Array(arrayBuffer), directory.firstBlock[0]);
    const row = table.insertRow();
    row.draggable = true;
    row.addEventListener("dragstart", function(event) {
        console.log("[Drag start]");
        PSXMCViewerController.prototype.transferObject = directory;
        event.dataTransfer.setData(controller.DRAG_AND_DROP_TYPE, null);
    });

    row.addEventListener("dragend", function(event) {
        console.log("[Drag end] Event dropEffect: " + event.dataTransfer.dropEffect);
        PSXMCViewerController.prototype.transferObject = null;
    });

    let fileHeader = directory.getFileHeader();

    // Name
    let newCell = row.insertCell();
    let cellText = document.createTextNode(directory.getRegion());
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(directory.getGameID());
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(directory.getFileNameText());
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(fileHeader.getTitle());
    newCell.appendChild(cellText);

    // Size
    newCell = row.insertCell();
    cellText = document.createTextNode(directory.size[0]);
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(directory.getFrameNumber());
    newCell.appendChild(cellText);


    newCell = row.insertCell();
    cellText = document.createTextNode(directory.isFirstBlock());
    newCell.appendChild(cellText);


    newCell = row.insertCell();
    cellText = document.createTextNode(directory.isMidBlock());
    newCell.appendChild(cellText);


    newCell = row.insertCell();
    cellText = document.createTextNode(directory.isLastBlock());
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(directory.nextBlock[0]);
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(directory.nextBlockEnd());
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(fileHeader.iconFlag[0]);
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    cellText = document.createTextNode(fileHeader.numIcons[0]);
    newCell.appendChild(cellText);

    newCell = row.insertCell();
    let canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.style.border = "1px solid";

    fileHeader.currentFrame = 0;

    drawIcon(canvas, fileHeader.getIconBitmap(fileHeader.currentFrame), fileHeader.iconPalette);

    if (fileHeader.frameIntervalInMs() > 0) {
        const timer = setInterval(function drawInterval() {
            fileHeader.currentFrame = (fileHeader.currentFrame + 1)%fileHeader.numIcons[0];
            drawIcon(canvas, fileHeader.getIconBitmap(fileHeader.currentFrame), fileHeader.iconPalette);
        }, fileHeader.frameIntervalInMs());
        this.timers.push(timer);
    }

    newCell.appendChild(canvas);

    newCell = row.insertCell();
    cellText = document.createTextNode("Delete");
    newCell.addEventListener("click", function(event) {
        console.log("Delete");
        directory.mcard.deleteDirectoryEntry(directory);
        controller.resetState();
        controller.displayData();

    });
    newCell.appendChild(cellText);

    /* Fill memory card */
    for (let drawDirectory = directory; drawDirectory != null; drawDirectory = drawDirectory.getNextDirectory()) {
        this.drawMemoryCardBlockIcon(drawDirectory.getFrameNumber(), fileHeader.getIconBitmap(fileHeader.currentFrame), fileHeader.iconPalette);
    }
}


PSXMCViewerController.prototype.drawMemoryCard = function() {
    const canvas = this.container.querySelector(".memorycard")

    canvas.width = PSXMC_CANVAS_FULL_BLOCK_SIZE*PSXMC_CANVAS_BLOCKS_PER_COLUMN;
    canvas.height = PSXMC_CANVAS_FULL_BLOCK_SIZE*(TOTAL_BLOCKS/PSXMC_CANVAS_BLOCKS_PER_COLUMN);
    canvas.style.border = "1px solid";

    // console.log("Canvas: " + canvas.width + "x" + canvas.height);

    var ctx = canvas.getContext("2d");
    for (let idx = 0; idx < TOTAL_BLOCKS; ++idx)
        this.drawMemoryCardBlock(ctx, idx);

}

PSXMCViewerController.prototype.drawMemoryCardBlockIcon = function(dataBlock, bitmap, palette) {
        const canvas = this.container.querySelector(".memorycard");
        var context = canvas.getContext("2d");

        this.drawMemoryCardBlock(context, dataBlock, bitmap, palette);
}


PSXMCViewerController.prototype.drawMemoryCardBlock = function(context, blockIdx, bitmap, palette) {
    const row = Math.floor(blockIdx/PSXMC_CANVAS_BLOCKS_PER_COLUMN);
    const column = blockIdx%PSXMC_CANVAS_BLOCKS_PER_COLUMN;
    const rowPixel = row*PSXMC_CANVAS_FULL_BLOCK_SIZE;
    const columnPixel = column*PSXMC_CANVAS_FULL_BLOCK_SIZE;
    // console.log("Draw block [" + blockIdx + "] = " + row + "x" + column);

    if (PSXMC_CANVAS_BLOCK_BORDER > 0) {
        context.fillStyle = 'black';
        context.fillRect(columnPixel + PSXMC_CANVAS_BLOCK_MARGIN,
                         rowPixel + PSXMC_CANVAS_BLOCK_MARGIN,
                         PSXMC_CANVAS_FULL_BLOCK_SIZE - PSXMC_CANVAS_BLOCK_MARGIN*2,
                         PSXMC_CANVAS_FULL_BLOCK_SIZE - PSXMC_CANVAS_BLOCK_MARGIN*2);
    }

    if (bitmap) {
        drawIconToContext(context, bitmap, palette, columnPixel + PSXMC_CANVAS_BLOCK_MARGIN + PSXMC_CANVAS_BLOCK_BORDER, rowPixel + PSXMC_CANVAS_BLOCK_MARGIN + PSXMC_CANVAS_BLOCK_BORDER);
    }
    else {
        context.fillStyle = 'white';
        context.fillRect(columnPixel + PSXMC_CANVAS_BLOCK_MARGIN + PSXMC_CANVAS_BLOCK_BORDER,
                         rowPixel + PSXMC_CANVAS_BLOCK_MARGIN + PSXMC_CANVAS_BLOCK_BORDER,
                         PSXMC_CANVAS_FULL_BLOCK_SIZE - PSXMC_CANVAS_BLOCK_MARGIN*2 - PSXMC_CANVAS_BLOCK_BORDER*2,
                         PSXMC_CANVAS_FULL_BLOCK_SIZE - PSXMC_CANVAS_BLOCK_MARGIN*2 - PSXMC_CANVAS_BLOCK_BORDER*2);
    }
}

/*
  0-4   Red       (0..31)         ;\Color 0000h        = Fully-Transparent
  5-9   Green     (0..31)         ; Color 0001h..7FFFh = Non-Transparent
  10-14 Blue      (0..31)         ; Color 8000h..FFFFh = Semi-Transparent (*)
  15    Semi Transparency Flag    ;/(*) or Non-Transparent for opaque commands

Color bits: Alpha + 3 groups x 5 bits
    | 15  | 14  13  12  11  10 |  9   8  7   6   5 |  4  3   2   1   0 |
    |  A  |        Blue        |       Green       |        Red        |
*/
function paletteToRGBA(palette) {
    return {
        a :        1 /*1 - ((palette >> 5*3) & 0x01)*0.25*/, // Disabled transparency
        r : Math.floor(((palette >> 5*0) & 0x1F)/0x1F*255),
        g : Math.floor(((palette >> 5*1) & 0x1F)/0x1F*255),
        b : Math.floor(((palette >> 5*2) & 0x1F)/0x1F*255)
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
            // 16x16 as nibbles (every byte = 2 pixels)
            const row = Math.floor(index/(16/2));
            const column = (index%(16/2))*2;

            function drawPixel(column, row, pixelMap) {
                const pixelPalette = palette[pixelMap];
                const colors       = paletteToRGBA(pixelPalette);
                const style        = rgbaToStyleStr(colors);
                ctx.fillStyle      = style;
                ctx.fillRect(column, row, 1, 1);
            }

            const leftPixelMap   = data & 0xF;
            const rightPixelMap  = (data >> 4) & 0xF;

            drawPixel(columnOffset + column, rowOffset + row, leftPixelMap);
            drawPixel(columnOffset + column + 1, rowOffset + row, rightPixelMap);
        });
        imageCache[cacheKey] = ctx.getImageData(columnOffset, rowOffset, 16, 16);
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
