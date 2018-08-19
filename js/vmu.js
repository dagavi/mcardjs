'use strict';

/*
    VMU Reader
    Documentation from:
        http://dev.dcemulation.org/tutorials/all-about-vmu.htm
*/

function VMU(arrayBuffer) {
    if (arrayBuffer) this.parseArrayBuffer(arrayBuffer);
    else this.createAndFormatVMU();
}

// Constants
VMU.prototype.MEMORY_SIZE = 128*1024;
VMU.prototype.BLOCK_SIZE = 512;
VMU.prototype.TOTAL_BLOCKS = VMU.prototype.MEMORY_SIZE/VMU.prototype.BLOCK_SIZE;
VMU.prototype.ROOT_BLOCK = 255;

// Directory constants
VMU.prototype.FREE_BLOCK = 0xfffc;
VMU.prototype.LAST_BLOCK = 0xfffa;

/*
Root block [255] format:
    0x000-0x00f : All these bytes contain 0x55 to indicate a properly formatted card.
    0x010       : custom VMS colour (1 = use custom colours below, 0 = standard colour)
    0x011       : VMS colour blue component
    0x012       : VMS colour green component
    0x013       : VMS colour red component
    0x014       : VMS colour alpha component (use 100 for semi-transparent, 255 for opaque)
    0x015-0x02f : not used (all zeroes)
    0x030-0x037 : BCD timestamp (see Directory below)
    0x038-0x03f : not used (all zeroes)
    ...
    0x046-0x047 : 16 bit int (little endian) : location of FAT (254)
    0x048-0x049 : 16 bit int (little endian) : size of FAT in blocks (1)
    0x04a-0x04b : 16 bit int (little endian) : location of directory (253)
    0x04c-0x04d : 16 bit int (little endian) : size of directory in blocks (13)
    0x04e-0x04f : 16 bit int (little endian) : icon shape for this VMS (0-123)
    0x050-0x051 : 16 bit int (little endian) : number of user blocks (200)
    ...
*/
VMU.prototype.parseVMUHeader = function() {
    this.formatIndicator       = new Uint8Array (this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK , 16);
    this.customColours         = new Uint8Array (this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x10, 1);
    this.colourBlue            = new Uint8Array (this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x11, 1);
    this.colourGreen           = new Uint8Array (this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x12, 1);
    this.colourRed             = new Uint8Array (this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x13, 1);
    this.colourAlpha           = new Uint8Array (this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x14, 1);
    this.timestamp             = new Uint8Array (this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x30, 8);
    this.fatLocationView       = new Uint16Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x46, 1);
    this.fatSizeView           = new Uint16Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x48, 1);
    this.directoryLocationView = new Uint16Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x4a, 1);
    this.directorySizeView     = new Uint16Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x4c, 1);
    this.iconShapeView         = new Uint16Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x4e, 1);
    this.noUserBlocksView      = new Uint16Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*VMU.prototype.ROOT_BLOCK + 0x50, 1);
}

VMU.prototype.getFATView = function() {
    return new Uint16Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*this.fatLocationView[0], VMU.prototype.BLOCK_SIZE/2); // Divide by 2 because is Uint16
}

VMU.prototype.createAndFormatVMU = function() {
    console.log("Creating a new VMU");
    const dataArray = new Uint8Array(VMU.prototype.BLOCK_SIZE*VMU.prototype.TOTAL_BLOCKS);
    dataArray.fill(0);

    this.arrayBuffer = dataArray.buffer;

    this.parseVMUHeader();

    this.fatLocationView[0]       = 254;
    this.fatSizeView[0]           = 1;
    this.directoryLocationView[0] = 253;
    this.directorySizeView[0]     = 13;
    this.iconShapeView[0]         = 5;
    this.noUserBlocksView[0]      = 200;
    this.fatView                  = this.getFATView();

    // UnknownValues
    const typedArray = this.getBlockView(VMU.prototype.ROOT_BLOCK);
    typedArray[0x40] = 0xff;
    typedArray[0x44] = 0xff;
    typedArray[0x52] = 0x1f;
    typedArray[0x56] = 0x80;

    this.entries = [];

    // Set format check:
    this.formatIndicator.fill(0x55);

    // Colors
    this.customColours[0] = 1;
    this.colourBlue[0]    = 0xff;
    this.colourGreen[0]   = 0xff;
    this.colourRed[0]     = 0xff;
    this.colourAlpha[0]   = 0xff;

    /*
        Century (e.g. 19)
        Year within century (e.g. 99)
        Month within year (e.g. 11)
        Day within month (e.g. 1)
        Hour of day (e.g. 22)
        Minute of hour (e.g. 50)
        Second of minute (e.g. 12)
        Day of week (0 = monday, 6 = sunday)
    */
    const now    = new Date();
    const year   = numberToBCD(now.getFullYear(), 4);
    const month  = numberToBCD(now.getMonth(),    2);
    const day    = numberToBCD(now.getDate(),     2);
    const hour   = numberToBCD(now.getHours(),    2);
    const minute = numberToBCD(now.getMinutes(),  2);
    const second = numberToBCD(now.getSeconds(),  2);
    const dow    = numberToBCD(now.getDay(),      2);

    const dateArray = year.concat(month).concat(day).concat(hour).concat(minute).concat(second).concat(dow);
    this.timestamp.set(dateArray);

    // Start FAT
    // Directory
    this.fatView.fill(VMU.prototype.FREE_BLOCK);
    for (let directoryIdx = 0; directoryIdx < this.directorySizeView[0]; ++directoryIdx) {
        const block = this.directoryLocationView[0] - directoryIdx;
        let nextBlock = block - 1;
        if (directoryIdx == this.directorySizeView[0] - 1) nextBlock = VMU.prototype.LAST_BLOCK;
        this.fatView[block] = nextBlock;
    }

    this.fatView[VMU.prototype.ROOT_BLOCK] = VMU.prototype.LAST_BLOCK; // The header block
    this.fatView[this.fatLocationView[0]] = VMU.prototype.LAST_BLOCK; // The FAT block

    this.logRootBlock();
}

VMU.prototype.parseArrayBuffer = function(arrayBuffer) {
    console.log("Parse VMU " + arrayBuffer.byteLength)

    if (arrayBuffer.byteLength != VMU.prototype.MEMORY_SIZE) {
        throw new Error("Size error. VMU has to be " + VMU.prototype.MEMORY_SIZE + " bytes. Buffer contains " + arrayBuffer.byteLength + " bytes");
    }

    this.arrayBuffer = arrayBuffer;

    this.parseVMUHeader();
    this.fatView = this.getFATView();

    this.logRootBlock();

    this.parseDirectory();
}

/*
 * Writes actual parsed information about root block
 */
VMU.prototype.logRootBlock = function() {
    console.log("Format Indicator   = "  + this.formatIndicator.every(v => v == 0x55));
    console.log("Custom colours     = "  + this.customColours[0]);
    console.log("RGBA               = (" + this.colourRed[0] + ", " + this.colourGreen + ", " + this.colourBlue[0] + ", " + this.colourAlpha[0] + ")");
    console.log("Timestamp          = "  + this.getTimeStamp());
    console.log("Fat location       = "  + this.fatLocationView[0]);
    console.log("Fat size           = "  + this.fatSizeView[0]);
    console.log("Directory location = "  + this.directoryLocationView[0]);
    console.log("Directory size     = "  + this.directorySizeView[0]);
    console.log("Icon Shape         = "  + this.iconShapeView[0]);
    console.log("User blocks        = "  + this.noUserBlocksView[0]);
}

/*
 * Generates this.entries iterating over all entries of the directory and keeping
 * elements with type != 0
 */
VMU.prototype.parseDirectory = function() {
    this.entries = [];

    // List directory
    let block = this.directoryLocationView[0];
    for (let processedBlocks = 0; processedBlocks < this.directorySizeView[0]; ++processedBlocks) {
        // console.log("[Directory " + processedBlocks + " = " + block + "]")
        for (let directoryOffset = 0; directoryOffset < VMU.prototype.BLOCK_SIZE; directoryOffset += 32) {
            const directoryEntryView = new Uint8Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*block + directoryOffset, 32);
            const directory = this.parseDirectoryEntry(directoryEntryView);
            if (directory.type[0] != 0) {
                this.entries.push(directory);
            }
        }
        block = this.getNextFATBlock(block);
    }
}

VMU.prototype.getTimeStamp = function() {
    return bcdToDate(this.timestamp);
}


VMU.prototype.parseDirectoryEntry = function(directoryEntryView) {
    return new VMUDirectory(this, directoryEntryView);
}

/*
 * Return an Uint8Array with the content of the selected block
 */
VMU.prototype.getBlockView = function(block) {
    return new Uint8Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*block, VMU.prototype.BLOCK_SIZE);
}

/*
32-byte
    0x00      : 8 bit int : file type (0x00 = no file, 0x33 = data, 0xcc = game)
    0x01      : 8 bit int : copy protect (0x00 = copy ok, 0xff = copy protected)
    0x02-0x03 : 16 bit int (little endian) : location of first block
    0x04-0x0f : ASCII string : filename (12 characters)
    0x10-0x17 : BCD timestamp (see below) : file creation time
    0x18-0x19 : 16 bit int (little endian) : file size (in blocks)
    0x1a-0x1b : 16 bit int (little endian) : offset of header (in blocks) from file start
    0x1c-0x1f : unused (all zero)
*/
function VMUDirectory(mcard, directoryEntryView) {
    this.mcard        = mcard;
    this.type         = new Uint8Array (directoryEntryView.buffer, directoryEntryView.byteOffset + 0, 1);
    this.copy         = new Uint8Array (directoryEntryView.buffer, directoryEntryView.byteOffset + 1, 1);
    this.firstBlock   = new Uint16Array(directoryEntryView.buffer, directoryEntryView.byteOffset + 2, 1);
    this.filename     = new Uint8Array (directoryEntryView.buffer, directoryEntryView.byteOffset + 4, 12);
    this.timestamp    = new Uint8Array (directoryEntryView.buffer, directoryEntryView.byteOffset + 16, 8);
    this.size         = new Uint16Array(directoryEntryView.buffer, directoryEntryView.byteOffset + 24, 1);
    this.headerOffset = new Uint16Array(directoryEntryView.buffer, directoryEntryView.byteOffset + 26, 1);
}

VMUDirectory.prototype.utf8Decoder = new TextDecoder("utf-8");

VMUDirectory.prototype.getFileName = function() {
    return VMUDirectory.prototype.utf8Decoder.decode(this.filename);
}

VMUDirectory.prototype.getTimeStamp = function() {
    return bcdToDate(this.timestamp);
}

VMUDirectory.prototype.getArrayBuffer = function() {
    return new Uint8Array(this.type.buffer, this.type.byteOffset, 32);
}

VMUDirectory.prototype.getContent = function() {
    return new VMUContent(this);
}

/*
Content header:
    Offset  Size (bytes)    Datatype    Contents
    $00     16              Text        Description of file (shown in VMS file menu)
    $10     32              Text        Description of file (shown in DC boot ROM file manager)
    $30     16              String      Identifier of application that created the file
    $40     2               Integer     Number of icons (>1 for animated icons)
    $42     2               Integer     Icon animation speed
    $44     2               Integer     Graphic eyecatch type (0 = none)
    $46     2               Integer     CRC (Ignored for game files.)
    $48     4               Integer     Number of bytes of actual file data following header, icon(s) and graphic eyecatch. (Ignored for game files.)
    $4C     20                          Reserved (fill with zeros)
    $60     32              Integers    Icon palette (16 16-bit integers)
                                        Color bits: 4 groups x 4 bits
                                            | 15  14  13  12 | 11  10  9   8 |  7   6   5   4 |  3   2   1   0 |
                                            |      Alpha     |      Red      |      Green     |      Blue      |
    $80     512*n           Nybbles     Icon bitmaps (32x32 pixels)
    ...     depends on type ...         Graphic eyecatch palette and bitmap
*/
function VMUContent(directory) {
    let dataBlock = directory.firstBlock[0];
    for (let idx = 0; idx < directory.headerOffset[0]; ++idx) dataBlock = directory.mcard.getNextFATBlock(dataBlock);
    const contentView = directory.mcard.getBlockView(dataBlock);

    this.directory       = directory;
    this.vmsDescription  = new Uint8Array (contentView.buffer, contentView.byteOffset + 0x00, 16);
    this.bootDescription = new Uint8Array (contentView.buffer, contentView.byteOffset + 0x10, 32);
    this.creatorID       = new Uint8Array (contentView.buffer, contentView.byteOffset + 0x30, 16);
    this.numIcons        = new Uint16Array(contentView.buffer, contentView.byteOffset + 0x40, 1);
    this.animationSpeed  = new Uint16Array(contentView.buffer, contentView.byteOffset + 0x42, 1);
    this.eyecatchType    = new Uint16Array(contentView.buffer, contentView.byteOffset + 0x44, 1);
    this.crc             = new Uint16Array(contentView.buffer, contentView.byteOffset + 0x46, 1);
    this.size            = new Uint32Array(contentView.buffer, contentView.byteOffset + 0x48, 1);
    this.reserved        = new Uint8Array (contentView.buffer, contentView.byteOffset + 0x4c, 20);
    this.iconPalette     = new Uint16Array(contentView.buffer, contentView.byteOffset + 0x60, 16);
}

VMUContent.prototype.getVMSDescription = function() {
    return VMUDirectory.prototype.utf8Decoder.decode(this.vmsDescription);
}

VMUContent.prototype.getBootDescription = function() {
    return VMUDirectory.prototype.utf8Decoder.decode(this.bootDescription);
}

VMUContent.prototype.getcreatorID = function() {
    return VMUDirectory.prototype.utf8Decoder.decode(this.creatorID.slice(0, this.creatorID.indexOf(0)));
}

/*
32x32 (1024) pixels.  4 bits for palette index.
    | 7 6 5 4 | 3 2 1 0 |
    |  Left   |  Right  |
*/
VMUContent.prototype.getIconBitmap = function(bitmapIdx = 0) {
    if (bitmapIdx >= this.numIcons[0]) {
        console.error("Asking for bitmap " + bitmapIdx + " when number of bitmaps = " + this.numIcons[0]);
        return null;
    }
    const mcard = this.directory.mcard;
    const directoryEntryView = this.directory.getArrayBuffer();

    let block  = this.directory.firstBlock[0];;
    const offset = 0x80;
    while (bitmapIdx > 0) {
        block = mcard.getNextFATBlock(block);
        --bitmapIdx;
    }
    const bitmap = new Uint8Array(VMU.prototype.BLOCK_SIZE);
    bitmap.set(new Uint8Array(directoryEntryView.buffer, VMU.prototype.BLOCK_SIZE*block + offset, VMU.prototype.BLOCK_SIZE - 0x80));
    bitmap.set(new Uint8Array(directoryEntryView.buffer, VMU.prototype.BLOCK_SIZE*mcard.getNextFATBlock(block), 0x80), VMU.prototype.BLOCK_SIZE - 0x80);
    return bitmap;
}

/*
Helper that provides the number of seconds per frame in ms.
For static or corrupted files return 0.
*/
VMUContent.prototype.frameIntervalInMs = function() {
    if (this.numIcons[0] > 1 && this.animationSpeed[0] > 0) {
        return 1000*this.animationSpeed[0]/10 /this.numIcons[0];
    }
    return 0;
}

VMU.prototype.deleteDirectoryEntry = function(directory) {
    const idx = this.entries.indexOf(directory);

    if (idx < 0) {
        throw Error("Directory not found in entries array");
    }

    if (directory.type[0] == 0) {
        throw Error("Directory entry already deleted");
    }
    const chainSize = this.verifyFATChain(directory.firstBlock[0]);
    if (chainSize != directory.size[0]) {
        throw Error("Size doesn't match. Metadata (" + directory.size[0] + ") vs detected (" + chainSize + ")" );
    }
    directory.type[0] = 0;

    this.freeBlocks(directory.firstBlock[0]);

    this.entries.splice(idx, 1);
}

VMU.prototype.findFreeDirectoryEntry = function() {
    let block = this.directoryLocationView[0];
    for (let processedBlocks = 0; processedBlocks < this.directorySizeView[0]; ++processedBlocks) {
        // console.log("[Directory " + processedBlocks + " = " + block + "]")
        for (let directoryOffset = 0; directoryOffset < VMU.prototype.BLOCK_SIZE; directoryOffset += 32) {
            const directoryEntryView = new Uint8Array(this.arrayBuffer, VMU.prototype.BLOCK_SIZE*block + directoryOffset, 32);
            const directory = this.parseDirectoryEntry(directoryEntryView);
            if (directory.type[0] == 0) return directory;
        }
        block = this.getNextFATBlock(block);
    }
    return null;
}

VMU.prototype.copyDirectoryEntry = function(directory) {
    if (directory.type[0] == 0) {
        throw Error("Trying to copy a deleted directory");
    }
    const blocks = this.findFreeBlocks(directory.size[0]);
    // console.log("Found this " + directory.size[0] + " free blocks: " + blocks);

    const freeDirectoryEntry = this.findFreeDirectoryEntry();
    if (!freeDirectoryEntry) {
        throw Error("Cannot find free directory entry");
    }

    let srcBlock = directory.firstBlock[0];
    for (let idx = 0; idx < blocks.length; ++idx) {
        // console.log("Copy block " + idx + ": " +  srcBlock + " -> " + blocks[idx]);
        const srcMemory = directory.mcard.getBlockView(srcBlock);
        const dstMemory = this.getBlockView(blocks[idx]);

        dstMemory.set(srcMemory);

        if (idx < blocks.length - 1) this.fatView[blocks[idx]] = blocks[idx + 1];
        else this.fatView[blocks[idx]] = VMU.prototype.LAST_BLOCK;

        // Change srcBlock with "directory" fat
        srcBlock = directory.mcard.getNextFATBlock(srcBlock);
    }

    // Add directory to this.mcard
    freeDirectoryEntry.getArrayBuffer().set(directory.getArrayBuffer());
    freeDirectoryEntry.firstBlock[0] = blocks[0];

    this.entries.push(freeDirectoryEntry);
}

/*
    0xfffc    :  This block is unallocated
    0xfffa    :  This block is allocated to a file, and is the last block in that file
    0x00-0xff :  This block is allocated to a file, and is not the last block in that file
*/
VMU.prototype.getNextFATBlock = function(current) {
    const output = this.fatView[current];
    // console.log("getNextFATBlock(" + current + ") = " + output);
    return output;
}

/*
Method to verify a FAT chain.
Returns the number of blocks of the chain until endmark (included) is found.
 */
VMU.prototype.verifyFATChain = function(block) {
    if (block == VMU.prototype.FREE_BLOCK) return 0;

    let counter = 0;
    while (block != VMU.prototype.LAST_BLOCK) {
        if ((block & 0xFF00) != 0 && block != VMU.prototype.FREE_BLOCK && block != VMU.prototype.LAST_BLOCK) {
            throw Error("Unknown block value: " + block);
        }

        if (block == VMU.prototype.FREE_BLOCK) {
            throw Error("Free block found at block: " + block);
        }

        block = this.getNextFATBlock(block);
        ++counter;
    }
    return counter;
}

/*
Free's a chain of blocks starting on "block"
Pre: FAT is OK.
 */
VMU.prototype.freeBlocks = function(block) {
    let counter = 0;
    while (block != VMU.prototype.LAST_BLOCK) {
        const nextBlock = this.getNextFATBlock(block);
        this.fatView[block] = VMU.prototype.FREE_BLOCK;
        block = nextBlock;
        ++counter;
    }
    return counter;
}

/*
Returns the index (block number) of the next free block searching from "start"
(not included) and decreasing the value.
If no block is found throws an error.
 */
VMU.prototype.findNextFreeBlock = function(start) {
    if (start == undefined) start = this.noUserBlocksView[0];
    for (let block = start - 1; block >= 0; --block) {
        if (this.fatView[block] == VMU.prototype.FREE_BLOCK) return block;
    }
    throw Error("Can't find free blocks from start block: " + start);
}

/*
Returns an array with "noBlocks" blocks that are free.
 */
VMU.prototype.findFreeBlocks = function(noBlocks) {
    const blocks = [];
    while (blocks.length < noBlocks) {
        try {
            blocks.push(this.findNextFreeBlock(blocks[blocks.length - 1]));
            if (noBlocks - blocks.length > blocks[blocks.length - 1]) {
                // Fast stop
                throw Error();
            }
        }
        catch (error) {
            throw Error("Not enought space to allocate " + noBlocks + " blocks");
        }
    }
    return blocks;
}

/*
    Century (e.g. 19)
    Year within century (e.g. 99)
    Month within year (e.g. 11)
    Day within month (e.g. 1)
    Hour of day (e.g. 22)
    Minute of hour (e.g. 50)
    Second of minute (e.g. 12)
    Day of week (0 = monday, 6 = sunday)
*/
function bcdToDate(bcdArray) {
    return new Date(
                bcdToInt(bcdArray[0])*100 + bcdToInt(bcdArray[1]), // Year
                bcdToInt(bcdArray[2]), // Month
                bcdToInt(bcdArray[3]), // Day
                bcdToInt(bcdArray[4]), // Hour
                bcdToInt(bcdArray[5]), // Minute
                bcdToInt(bcdArray[6]) // Second
            );
}

function bcdToInt(byte) {
    return (byte >> 4)*10 + (byte&0xF);
}

/*
 * Method to convert a number to BCD.
 * If a number is odd last nibble will be wet F.
 *
 * minSize can be used to set the number of minimum digits to represent.
 * Examples:
 *    numberToBCD(1)     = [0x1F]
 *    numberToBCD(1, 2)  = [0x01]
 *    numberToBCD(1, 3)  = [0x00, 0x1F]
 *    numberToBCD(1, 4)  = [0x00, 0x01]
 *    numberToBCD(12)    = [0x12]
 *    numberToBCD(12, 3) = [0x01, 0x2F]
 *    numberToBCD(123)   = [0x12, 0x3F]
 *    numberToBCD(1234)  = [0x12, 0x34]
 */
function numberToBCD(number, minSize = 0) {
    const digits = [];
    let numDigits = 1;
    if (number > 0) numDigits = Math.floor(Math.log10(number)) + 1;
    let toFill = 0;
    if (numDigits < minSize) toFill = minSize - numDigits;

    let evenPosition = (numDigits + toFill)%2 == 0;
    if (!evenPosition) digits.push(0x0F); // Add filler value 0xF to last digit
    while ((number + toFill) > 0) {
        const digit = number%10;
        if (number == 0) --toFill;
        if (evenPosition) digits.push(digit);
        else digits[digits.length - 1] |= (digit << 4);
        number = Math.floor(number/10);
        evenPosition = !evenPosition;
    }

    // Add 0 case
    if (digits.lenght == 0) digits.push(0x0F);

    return digits.reverse();
}
