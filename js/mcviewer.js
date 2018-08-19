'use strict';

document.addEventListener('DOMContentLoaded', function() {
    new WebController(document.querySelector("main"));
});

function WebController(container) {
    const controller = this;
    this.container = container;
    this.tabCounter = 0;

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

    /* Materialize */
    // Floating button
    const floatingButton = container.querySelectorAll('.fixed-action-btn');
    const instances = M.FloatingActionButton.init(floatingButton, {});

    const dcButton = document.getElementById("newvmu");
    dcButton.addEventListener("click", function() {
        console.log("New VMU card");
        controller.createTab("vmu");
    });

    const psxButton = document.getElementById("newpsxmc");
    psxButton.addEventListener("click", function() {
        console.log("New PSX MC");
        controller.createTab("psxmc");
    });

    this.createTab("vmu");
}

WebController.prototype.createTab = function(type = null) {
    // Container for tabs
    const tabsContainer = this.container.querySelector("#tabs-container");

    // Menu container
    const tabHdrContainer = tabsContainer.querySelector(".tabs");

    // Generate new ID
    const newID = "mcard" + this.tabCounter;
    ++this.tabCounter;


    // Header
    const tabHdrTmpl = tabsContainer.querySelector("#tab-hdr-tmpl");
    const newHdrNode = document.importNode(tabHdrTmpl.content, true);
    const newANode = newHdrNode.querySelector("a");
    newANode.textContent = newID;
    newANode.href = "#" + newID;

    tabHdrContainer.appendChild(newHdrNode);

    // Body
    const tabBodyTmpl = tabsContainer.querySelector("#tab-body-tmpl");
    const newBodyNode = document.importNode(tabBodyTmpl.content, true);
    const newDiv = newBodyNode.firstElementChild;
    newDiv.id = newID;

    let mcViewerController = null;
    if (type == "vmu") mcViewerController = new VMUViewerController(newDiv.querySelector(".mcviewer"), newID + ".bin");
    else if (type == "psxmc") mcViewerController = new PSXMCViewerController(newDiv.querySelector(".mcviewer"), newID + ".srm");
    else throw new Error("Unrecognized type for tab: " + type);

    const controller = this;
    newANode.addEventListener("dragenter", function (event) {
        if (event.dataTransfer.types.includes(mcViewerController.getDragAndDropType())) {
            controller.tabController.select(newID);
        }
    });

    tabsContainer.appendChild(newBodyNode);

    if (this.tabController) this.tabController.destroy();
    this.tabController = M.Tabs.init(tabHdrContainer, {});
    this.tabController.select(newID);
}

WebController.prototype.imageCache = new Map();
WebController.prototype.transferObject = [];

class MCViewerController {
    constructor(container, fileName = null) {
        console.log("Loading MC Viewer Controller: " + MCViewerController.getNodePath(container));
        const controller = this;

        // Clone template and add it to container
        const viewerTemplate = document.querySelector("#" + this.getName() + "viewer-tmpl");
        const viewer = document.importNode(viewerTemplate.content, true);
        container.appendChild(viewer);

        // Work over clonned template, that will be container.lastElementChild
        this.container = container.lastElementChild;
        this.timers = [];
        this.table = this.container.querySelector(".elements");
        this.mcard = this.createMCObject();
        if (fileName != null) this.fileName = fileName;
        else this.fileName = "mc" + this.getExtension();

        this.container.addEventListener("dragover", function (event) {
            // console.log("[MCViewerController] dragover " + event.dataTransfer.types);

            if ((event.dataTransfer.types.includes(controller.getDragAndDropType()) && WebController.prototype.transferObject.some(dir => dir.mcard != controller.mcard))
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

            if (event.dataTransfer.types.includes(controller.getDragAndDropType())) {
                const directories = WebController.prototype.transferObject.filter(dir => dir.mcard != controller.mcard);
                const directory = directories[0];

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
            MCViewerController.saveAs(new Blob([controller.mcard.arrayBuffer], {type: 'application/octet-stream'}), controller.fileName);
        });

        window.onerror = function(message, file, line, col, error) {
            showError(message);
        }

        this.drawMemoryCard();
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
    static saveAs(blob, fileName) {
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

    static getNodePath(node) {
        if (!node) return null;
        let string = node.nodeName;
        if (node.id) string += "@" + node.id;
        const parent = MCViewerController.getNodePath(node.parentNode);
        if (parent) string = parent + " > " + string;
        return string;
    }

    getDragAndDropType() {
        return "mcard/" + this.getName();
    }

    getBlockMargin()    { return 1; }
    getBlockBorder()    { return 1; }
    getFullBlockSize()  { return this.getBlockSize() + this.getBlockMargin()*2 + this.getBlockBorder()*2; }

    resetState() {
        // Clear timers
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers = [];

        // Clear table:
        while (this.table.rows.length > 1) {
            this.table.deleteRow(-1);
        }

        // Draw the MC schema
        this.drawMemoryCard();
    }

    drawMemoryCardBlockIcon(dataBlock, bitmap, palette) {
            const canvas = this.container.querySelector(".memorycard");
            var context = canvas.getContext("2d");

            this.drawMemoryCardBlock(context, dataBlock, bitmap, palette);
    }

    drawIcon(canvas, bitmap, palette) {
        var ctx = canvas.getContext("2d");
        this.drawIconToContext(ctx, bitmap, palette, 0, 0);
    }

    drawMemoryCard() {
        const canvas = this.container.querySelector(".memorycard")

        canvas.width = this.getFullBlockSize()*this.getBlocksPerColumn();
        canvas.height = this.getFullBlockSize()*(this.getTotalBlocks()/this.getBlocksPerColumn());
        canvas.style.border = "1px solid";

        // console.log("Canvas: " + canvas.width + "x" + canvas.height);

        var ctx = canvas.getContext("2d");
        for (let idx = 0; idx < VMU.prototype.TOTAL_BLOCKS; ++idx)
            this.drawMemoryCardBlock(ctx, idx);

    }

    drawMemoryCardBlock(context, blockIdx, bitmap, palette) {
        const row = Math.floor(blockIdx/this.getBlocksPerColumn());
        const column = blockIdx%this.getBlocksPerColumn();
        const rowPixel = row*this.getFullBlockSize();
        const columnPixel = column*this.getFullBlockSize();
        // console.log("Draw block [" + blockIdx + "] = " + row + "x" + column);

        if (this.getBlockBorder() > 0) {
            context.fillStyle = 'black';
            context.fillRect(columnPixel + this.getBlockMargin(),
                             rowPixel + this.getBlockMargin(),
                             this.getFullBlockSize() - this.getBlockMargin()*2,
                             this.getFullBlockSize() - this.getBlockMargin()*2);
        }

        if (bitmap) {
            this.drawIconToContext(context, bitmap, palette, columnPixel + this.getBlockMargin() + this.getBlockBorder(), rowPixel + this.getBlockMargin() + this.getBlockBorder());
        }
        else {
            context.fillStyle = 'white';
            context.fillRect(columnPixel + this.getBlockMargin() + this.getBlockBorder(),
                             rowPixel + this.getBlockMargin() + this.getBlockBorder(),
                             this.getFullBlockSize() - this.getBlockMargin()*2 - this.getBlockBorder()*2,
                             this.getFullBlockSize() - this.getBlockMargin()*2 - this.getBlockBorder()*2);
        }
    }

    drawIconToContext(ctx, bitmap, palette, columnOffset = 0, rowOffset = 0) {
        const controller = this;
        const cacheKey = bitmap;
        if (!(cacheKey in WebController.prototype.imageCache)) {
            bitmap.forEach(function(data, index) {
                // Bitmap as nibbles (every byte = 2 pixels)
                const row = Math.floor(index/(controller.getBlockSize()/2));
                const column = (index%(controller.getBlockSize()/2))*2;

                function drawPixel(column, row, pixelMap) {
                    const pixelPalette = palette[pixelMap];
                    const colors       = controller.paletteToRGBA(pixelPalette);
                    const style        = MCViewerController.rgbaToStyleStr(colors);
                    ctx.fillStyle      = style;
                    ctx.fillRect(column, row, 1, 1);
                }

                let leftPixelMap  = (data >> 4) & 0xF;
                let rightPixelMap = data & 0xF;

                if (controller.reverseBitmapNibble()) {
                    const backupPixelMap = leftPixelMap;
                    leftPixelMap = rightPixelMap;
                    rightPixelMap = backupPixelMap;
                }

                drawPixel(columnOffset + column, rowOffset + row, leftPixelMap);
                drawPixel(columnOffset + column + 1, rowOffset + row, rightPixelMap);
            });
            WebController.prototype.imageCache[cacheKey] = ctx.getImageData(columnOffset, rowOffset, this.getBlockSize(), this.getBlockSize());
        }
        else {
            ctx.putImageData(WebController.prototype.imageCache[cacheKey], columnOffset, rowOffset);
        }
    }

    reverseBitmapNibble() { return false; }

    static rgbaToStyleStr(rgba) {
        return "rgba(" + rgba.r + ", " + rgba.g + ", " + rgba.b + ", " + rgba.a + ")";
    }

    readFile(file) {
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

    parseArrayBuffer(arrayBuffer) {
        this.mcard.parseArrayBuffer(arrayBuffer);
        this.displayData();
    }

    displayData() {
        const controller = this;
        this.mcard.entries.forEach(function(directoryEntry) {
            controller.displayDirectoryEntry(directoryEntry, controller.table);
        });
    }

    displayDirectoryEntry(directory, table) {
        const controller = this;

        // hexdump(new Uint8Array(arrayBuffer), directory.firstBlock[0]);
        const row = table.insertRow();
        row.draggable = true;
        row.addEventListener("dragstart", function(event) {
            console.log("[Drag start]");
            WebController.prototype.transferObject = [directory];
            event.dataTransfer.setData(controller.getDragAndDropType(), null);
        });

        row.addEventListener("dragend", function(event) {
            console.log("[Drag end] Event dropEffect: " + event.dataTransfer.dropEffect);
            WebController.prototype.transferObject = [];
        });

        row.addEventListener("click", function(event) {
            console.log("[Row click]");
            event.currentTarget.classList.toggle("selected-row");
        });

        this.fillDirectory(row, directory);

        let newCell = row.insertCell();
        let canvas = document.createElement('canvas');
        canvas.width = this.getBlockSize();
        canvas.height = this.getBlockSize();
        canvas.style.border = "1px solid";

        const contentHeader = directory.getContent();
        contentHeader.currentFrame = 0;
        this.drawIcon(canvas, contentHeader.getIconBitmap(contentHeader.currentFrame), contentHeader.iconPalette);

        if (contentHeader.frameIntervalInMs() > 0) {
            const timer = setInterval(function drawInterval() {
                contentHeader.currentFrame = (contentHeader.currentFrame + 1)%contentHeader.numIcons[0];
                controller.drawIcon(canvas, contentHeader.getIconBitmap(contentHeader.currentFrame), contentHeader.iconPalette);
            }, contentHeader.frameIntervalInMs());
            this.timers.push(timer);
        }

        newCell.appendChild(canvas);

        newCell = row.insertCell();
        const cellText = document.createTextNode("✖");
        newCell.addEventListener("click", function(event) {
            console.log("Delete");
            directory.mcard.deleteDirectoryEntry(directory);
            controller.resetState();
            controller.displayData();

        });
        newCell.appendChild(cellText);
    }
}

const VMU_CANVAS_BLOCKS_PER_COLUMN = 16;
const VMU_CANVAS_BLOCK_SIZE = 32;
const VMU_CANVAS_BLOCK_MARGIN = 1;
const VMU_CANVAS_BLOCK_BORDER = 1;

class VMUViewerController extends MCViewerController {
    constructor(container, fileName = null) {
        super(container, fileName);
    }

    createMCObject() {
        return new VMU();
    }

    getName() {
        return "vmu";
    }

    getExtension() {
        return "bin";
    }

    getTotalBlocks()     { return VMU.prototype.TOTAL_BLOCKS; }

    getBlocksPerColumn() { return VMU_CANVAS_BLOCKS_PER_COLUMN; }
    getBlockSize()       { return VMU_CANVAS_BLOCK_SIZE; }

    /*
    Color bits: 4 groups x 4 bits
        | 15  14  13  12 | 11  10  9   8 |  7   6   5   4 |  3   2   1   0 |
        |      Alpha     |      Red      |      Green     |      Blue      |
    */
    paletteToRGBA(palette) {
        return {
            a :            ((palette >> 4*3) & 0xF)/15,
            r : Math.floor(((palette >> 4*2) & 0xF)/15*255),
            g : Math.floor(((palette >> 4*1) & 0xF)/15*255),
            b : Math.floor(((palette >> 4*0) & 0xF)/15*255)
        };
    }

    displayDirectoryEntry2(directory, table) {
        console.log("[" + pad(directory.type[0].toString(16), 2) + "] Filename: " + directory.getFileName() + " [" + directory.size[0] + " blocks][First " + directory.firstBlock[0] + "+" + directory.headerOffset[0] + "]");
        const controller = this;

        // hexdump(new Uint8Array(arrayBuffer), directory.firstBlock[0]);
        const row = table.insertRow();
        row.draggable = true;
        row.addEventListener("dragstart", function(event) {
            console.log("[Drag start]");
            WebController.prototype.transferObject = [directory];
            event.dataTransfer.setData(controller.getDragAndDropType(), null);
        });

        row.addEventListener("dragend", function(event) {
            console.log("[Drag end] Event dropEffect: " + event.dataTransfer.dropEffect);
            WebController.prototype.transferObject = [];
        });

        row.addEventListener("click", function(event) {
            console.log("[Row click]");
            event.currentTarget.classList.toggle("selected-row");
        });

    }

    fillDirectory(row, directory) {
        let newCell = row.insertCell();
        let cellText = document.createTextNode(directory.getFileName());
        newCell.appendChild(cellText);

        newCell = row.insertCell();
        cellText = document.createTextNode(directory.getTimeStamp().toLocaleString());
        newCell.appendChild(cellText);

        newCell = row.insertCell();
        cellText = document.createTextNode(directory.size[0]);
        newCell.appendChild(cellText);

        const contentHeader = directory.getContent();

        newCell = row.insertCell();
        cellText = document.createTextNode(contentHeader.getVMSDescription());
        newCell.appendChild(cellText);

        newCell = row.insertCell();
        cellText = document.createTextNode(contentHeader.getBootDescription());
        newCell.appendChild(cellText);

        /* Fill memory card */
        let dataBlockIterator = directory.firstBlock[0];
        for (let idx = 0; idx < directory.size[0]; ++idx) {
            this.drawMemoryCardBlockIcon(dataBlockIterator, contentHeader.getIconBitmap(), contentHeader.iconPalette);
            dataBlockIterator = this.mcard.getNextFATBlock(dataBlockIterator);
        }

    }
}

const PSXMC_CANVAS_BLOCKS_PER_COLUMN = 16;
const PSXMC_CANVAS_BLOCK_SIZE = 16;

class PSXMCViewerController extends MCViewerController {
    constructor(container, fileName = null) {
        super(container, fileName);
    }

    createMCObject() {
        return new PSXMC();
    }

    getName() {
        return "psxmc";
    }

    getExtension() {
        return "srm";
    }

    getTotalBlocks()     { return PSXMC.prototype.TOTAL_BLOCKS;}

    getBlocksPerColumn() { return PSXMC_CANVAS_BLOCKS_PER_COLUMN; }
    getBlockSize()       { return PSXMC_CANVAS_BLOCK_SIZE; }
    reverseBitmapNibble() { return true; }


    /*
      0-4   Red       (0..31)         ;\Color 0000h        = Fully-Transparent
      5-9   Green     (0..31)         ; Color 0001h..7FFFh = Non-Transparent
      10-14 Blue      (0..31)         ; Color 8000h..FFFFh = Semi-Transparent (*)
      15    Semi Transparency Flag    ;/(*) or Non-Transparent for opaque commands

    Color bits: Alpha + 3 groups x 5 bits
        | 15  | 14  13  12  11  10 |  9   8  7   6   5 |  4  3   2   1   0 |
        |  A  |        Blue        |       Green       |        Red        |
    */
    paletteToRGBA(palette) {
        return {
            a :        1 /*1 - ((palette >> 5*3) & 0x01)*0.25*/, // Disabled transparency
            r : Math.floor(((palette >> 5*0) & 0x1F)/0x1F*255),
            g : Math.floor(((palette >> 5*1) & 0x1F)/0x1F*255),
            b : Math.floor(((palette >> 5*2) & 0x1F)/0x1F*255)
        };
    }

    fillDirectory(row, directory) {
        let fileHeader = directory.getFileHeader();

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

        newCell = row.insertCell();
        cellText = document.createTextNode(directory.size[0]);
        newCell.appendChild(cellText);

        /* Fill memory card */
        for (let drawDirectory = directory; drawDirectory != null; drawDirectory = drawDirectory.getNextDirectory()) {
            this.drawMemoryCardBlockIcon(drawDirectory.getFrameNumber(), fileHeader.getIconBitmap(), fileHeader.iconPalette);
        }
    }
}

function showError(msg) {
    console.error(msg);

    M.toast({
        html: msg,
        classes: 'rounded red'
    })
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
