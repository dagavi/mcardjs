'use strict';

/*
    PSXMC Reader
    Documentation from:
        http://problemkaputt.de/psx-spx.htm
*/

function PSXMC(arrayBuffer) {
    if (arrayBuffer) this.parseArrayBuffer(arrayBuffer);
    else this.createAndFormatPSXMC();
}

// Constants
PSXMC.prototype.MEMORY_SIZE = 128*1024;
PSXMC.prototype.BLOCK_SIZE = 8*1024;
PSXMC.prototype.TOTAL_BLOCKS = PSXMC.prototype.MEMORY_SIZE/PSXMC.prototype.BLOCK_SIZE;
PSXMC.prototype.ROOT_BLOCK = 0;

PSXMC.prototype.FRAME_SIZE = 128;
PSXMC.prototype.FRAMES_IN_BLOCK = PSXMC.prototype.BLOCK_SIZE/PSXMC.prototype.FRAME_SIZE;
PSXMC.prototype.NUM_DIRECTORY_ENTRIES = 15;

// Directory constants
PSXMC.prototype.DIRECTORY_IN_USE = 0x50;
PSXMC.prototype.DIRECTORY_FREE   = 0xA0;

PSXMC.prototype.FIRST_BLOCK      = 0x1;
PSXMC.prototype.MID_BLOCK        = 0x2;
PSXMC.prototype.LAST_BLOCK       = 0x3;

PSXMC.prototype.NEXT_END_MARKER  = 0xFFFF;

PSXMC.prototype.createAndFormatPSXMC = function() {
    console.log("Creating a new PSX Memory Card");
    const dataArray = new Uint8Array(PSXMC.prototype.BLOCK_SIZE*PSXMC.prototype.TOTAL_BLOCKS);
    dataArray.fill(0);

    this.arrayBuffer = dataArray.buffer;

    /*
    Header Frame (Block 0, Frame 0)
      00h-01h Memory Card ID (ASCII "MC")
      02h-7Eh Unused (zero)
      7Fh     Checksum (all above bytes XORed with each other) (usually 0Eh)
    */
    dataArray.set(Array.prototype.map.call("MC", ch => ch.charCodeAt()));
    dataArray[0x7F] = 0x0E;

    this.entries = [];

    for (let frame = 0; frame < PSXMC.prototype.NUM_DIRECTORY_ENTRIES; ++frame) {
        const directory = this.getDirectory(frame);
        directory.delete();
        directory.checksum[0] = 0xA0;
    }

    /*
    Broken Sector List (Block 0, Frame 16..35)
      00h-03h Broken Sector Number (Block*64+Frame) (FFFFFFFFh=None)
      04h-7Eh Garbage (usually 00h-filled) (some cards have [08h..09h]=FFFFh)
      7Fh     Checksum (all above bytes XORed with each other)
    If Block0/Frame(16+N) indicates that a given sector is broken, then the data for that sector is stored in Block0/Frame(36+N).
    */
    // Fill broken sector list:
    for (let frame = 16; frame <= 35; ++frame) {
        const bslFrame = this.getFrame(0, frame);
        bslFrame.set([0xFF, 0xFF, 0xFF, 0xFF]);
        bslFrame[0x08] = 0xFF;
        bslFrame[0x09] = 0xFF;
    }

    /*
    Broken Sector Replacement Data (Block 0, Frame 36..55)
      00h-7Fh Data (usually FFh-filled, if there's no broken sector)

    Unused Frames (Block 0, Frame 56..62)
      00h-7Fh Unused (usually FFh-filled)

    Write Test Frame (Block 0, Frame 63)
    Reportedly "write test". Usually same as Block 0 ("MC", 253 zero-bytes, plus checksum 0Eh).
    */
    const writeTest = this.getFrame(0, 63);
    writeTest.set(this.getFrame(0, 0));
}

PSXMC.prototype.parseArrayBuffer = function(arrayBuffer) {
    console.log("Parse PSX Memory Card " + arrayBuffer.byteLength)

    if (arrayBuffer.byteLength != PSXMC.prototype.MEMORY_SIZE) {
        throw new Error("Size error. PSX Memory Card has to be " + PSXMC.prototype.MEMORY_SIZE + " bytes. Buffer contains " + arrayBuffer.byteLength + " bytes");
    }

    this.arrayBuffer = arrayBuffer;

    this.parseDirectory();
}

PSXMC.prototype.getFrame = function(block, frame) {
    return new Uint8Array(this.arrayBuffer, PSXMC.prototype.BLOCK_SIZE*block + PSXMC.prototype.FRAME_SIZE*frame, PSXMC.prototype.FRAME_SIZE);
}

PSXMC.prototype.getBlock = function(block) {
    return new Uint8Array(this.arrayBuffer, PSXMC.prototype.BLOCK_SIZE*block, PSXMC.prototype.BLOCK_SIZE);
}

/*
Returns a pointer to the idx'th Directory, 0 indexed.
*/
PSXMC.prototype.getDirectory = function(idx) {
    if (idx < 0 || idx > 14) {
        throw new Error("Ask for directory " + idx + " when this value need to be in range [0..14]");
    }
    return new PSXMCDirectory(this, this.getFrame(0, idx + 1));
}

/*
 * Generates this.entries iterating over all entries of the directory and keeping
 * elements that exists.
 */
PSXMC.prototype.parseDirectory = function() {

    this.entries = [];

    for (let frame = 0; frame < PSXMC.prototype.NUM_DIRECTORY_ENTRIES; ++frame) {
        const directory = this.getDirectory(frame);
        if (directory.inUse() && directory.isFirstBlock()) this.entries.push(directory);
    }
}

PSXMC.prototype.deleteDirectoryEntry = function(directory) {
    const idx = this.entries.indexOf(directory);

    if (idx < 0) {
        throw Error("Directory not found in entries array");
    }

    if (!directory.inUse()) {
        throw Error("Directory not in use");
    }
    for (let dir = directory; dir != null; dir = dir.getNextDirectory()) {
        console.log("Deleting block: " + dir.getFrameNumber());
        if (!dir.inUse()) { // Non-blocking check of all the chain
            console.error("Directory not in use");
        }
        dir.delete();
    }
    this.entries.splice(idx, 1);
}

PSXMC.prototype.copyDirectoryEntry = function(directory) {
    if (!directory.inUse()) {
        throw Error("Trying to copy a directory that is not in use");
    }

    const freeDirectories = [];

    for (let i = 0; i < PSXMC.prototype.NUM_DIRECTORY_ENTRIES && freeDirectories.length < directory.getNumBlocks(); ++i) {
        const iDirectory = this.getDirectory(i);
        if (iDirectory.itsFree()) freeDirectories.push(iDirectory);
    }

    if (freeDirectories.length < directory.getNumBlocks()) {
        throw Error("Cannot find " + directory.getNumBlocks() + " free blocks. Only found " + freeDirectories.length);
    }

    let srcDirectory = directory;
    for (let idx = 0; idx < freeDirectories.length; ++idx) {
        // Copy directory
        const dstDirectory = freeDirectories[idx];
        dstDirectory.view.set(srcDirectory.view);

        // Copy data block
        const srcMemory = srcDirectory.mcard.getBlock(srcDirectory.getFrameNumber());
        const dstMemory = dstDirectory.mcard.getBlock(dstDirectory.getFrameNumber());
        dstMemory.set(srcMemory);

        srcDirectory = srcDirectory.getNextDirectory();

        // Change "next block"
        if (srcDirectory) dstDirectory.nextBlock[0] = freeDirectories[idx + 1].getFrameNumber() - 1;
    }

    this.entries.push(freeDirectories[0]);
}

/*
Directory Frames (Block 0, Frame 1..15)
  00h-03h Block Allocation State
            00000051h - In use ;first-or-only block of a file
            00000052h - In use ;middle block of a file (if 3 or more blocks)
            00000053h - In use ;last block of a file   (if 2 or more blocks)
            000000A0h - Free   ;freshly formatted
            000000A1h - Free   ;deleted (first-or-only block of file)
            000000A2h - Free   ;deleted (middle block of file)
            000000A3h - Free   ;deleted (last block of file)
  04h-07h Filesize in bytes (2000h..1E000h; in multiples of 8Kbytes)
  08h-09h Pointer to the NEXT block number (minus 1) used by the file
            (ie. 0..14 for Block Number 1..15) (or FFFFh if last-or-only block)
  0Ah-1Eh Filename in ASCII, terminated by 00h (max 20 chars, plus ending 00h)
  1Fh     Zero (unused)
  20h-7Eh Garbage (usually 00h-filled)
  7Fh     Checksum (all above bytes XORed with each other)
Filesize [04h..07h] and Filename [0Ah..1Eh] are stored only in the first
directory entry of a file (ie. with State=51h or A1h), other directory entries have that bytes zero-filled.
*/
function PSXMCDirectory(mcard, directoryEntryView) {
    this.mcard     = mcard;
    this.view      = directoryEntryView;
    this.state     = new Uint32Array(directoryEntryView.buffer, directoryEntryView.byteOffset + 0x00, 1);
    this.size      = new Uint32Array(directoryEntryView.buffer, directoryEntryView.byteOffset + 0x04, 1);
    this.nextBlock = new Uint16Array(directoryEntryView.buffer, directoryEntryView.byteOffset + 0x08, 1);
    this.filename  = new Uint8Array (directoryEntryView.buffer, directoryEntryView.byteOffset + 0x0A, 21);
    this.checksum  = new Uint8Array (directoryEntryView.buffer, directoryEntryView.byteOffset + 0x7F, 1);
}

PSXMCDirectory.prototype.utf8Decoder = new TextDecoder("utf-8");

PSXMCDirectory.prototype.getFrameNumber = function() {
    return this.state.byteOffset/PSXMC.prototype.FRAME_SIZE;
}

PSXMCDirectory.prototype.inUse = function() {
    return !this.itsFree() && (this.state[0] & PSXMC.prototype.DIRECTORY_IN_USE) == PSXMC.prototype.DIRECTORY_IN_USE;
}

PSXMCDirectory.prototype.delete = function() {
    this.state[0]     = (this.state[0] & 0x0F) | PSXMC.prototype.DIRECTORY_FREE;
    this.nextBlock[0] = PSXMC.prototype.NEXT_END_MARKER;
}

PSXMCDirectory.prototype.itsFree = function() {
    return (this.state[0] & PSXMC.prototype.DIRECTORY_FREE) == PSXMC.prototype.DIRECTORY_FREE;
}

PSXMCDirectory.prototype.isCorrect = function() {
    return this.inUse() || this.itsFree();
}

PSXMCDirectory.prototype.isFirstBlock = function() {
    return (this.state[0] & 0xF) == PSXMC.prototype.FIRST_BLOCK;
}

PSXMCDirectory.prototype.isMidBlock = function() {
    return (this.state[0] & 0xF) == PSXMC.prototype.MID_BLOCK;
}

PSXMCDirectory.prototype.isLastBlock = function() {
    return (this.state[0] & 0xF) == PSXMC.prototype.LAST_BLOCK;
}

PSXMCDirectory.prototype.getNumBlocks = function() {
    return Math.ceil(this.size[0]/PSXMC.prototype.BLOCK_SIZE);
}

PSXMCDirectory.prototype.nextBlockEnd = function() {
    return this.nextBlock[0] == PSXMC.prototype.NEXT_END_MARKER;
}

PSXMCDirectory.prototype.getNextDirectory = function() {
    if (this.nextBlockEnd()) return null;
    return this.mcard.getDirectory(this.nextBlock[0]);
}

PSXMCDirectory.prototype.getFileName = function() {
    return this.utf8Decoder.decode(this.filename.slice(0, this.filename.indexOf(0)));
}

PSXMCDirectory.prototype.getRegion = function() {
    return this.getFileName().slice(0, 2);
}

PSXMCDirectory.prototype.getGameID = function() {
    return this.getFileName().slice(2, 12);
}

PSXMCDirectory.prototype.getFileNameText = function() {
    return this.getFileName().slice(12);
}

PSXMCDirectory.prototype.getFileHeader = function() {
    return new TitleFrame(this, this.mcard.getFrame(this.getFrameNumber(), 0));
}

/*
Title Frame (Block 1..15, Frame 0) (in first block of file only)
  00h-01h  ID (ASCII "SC")
  02h      Icon Display Flag
             11h...Icon has 1 frame  (static) (same image shown forever)
             12h...Icon has 2 frames (animated) (changes every 16 PAL frames)
             13h...Icon has 3 frames (animated) (changes every 11 PAL frames)
            Values other than 11h..13h seem to be treated as corrupted file
            (causing the file not to be listed in the bootmenu)
  03h      Block Number (1-15)  "icon block count"  Uh?
                   (usually 01h or 02h... might be block number within
                   files that occupy 2 or more blocks)
                   (actually, that kind of files seem to HAVE title frames
                   in ALL of their blocks; not only in their FIRST block)
                   (at least SOME seem to have such duplicated title frame,
                   but not all?)
  04h-43h  Title in Shift-JIS format (64 bytes = max 32 characters)
  44h-4Fh  Reserved (00h)
  50h-5Fh  Reserved (00h)  ;<-- this region is used for the Pocketstation
  60h-7Fh  Icon 16 Color Palette Data (each entry is 16bit CLUT)
           Color bits: Alpha + 3 groups x 5 bits
           | 15  | 14  13  12  11  10 |  9   8  7   6   5 |  4  3   2   1   0 |
           |  A  |        Blue        |       Green       |        Red        |
*/
function TitleFrame(directory, titleFrameEntryView) {
    this.directory     = directory;
    this.id            = new Uint8Array (titleFrameEntryView.buffer, titleFrameEntryView.byteOffset + 0x00, 2);
    this.iconFlag      = new Uint8Array (titleFrameEntryView.buffer, titleFrameEntryView.byteOffset + 0x02, 1);
    this.numIcons      = new Uint8Array (titleFrameEntryView.buffer, titleFrameEntryView.byteOffset + 0x03, 1);
    this.titleSJIS     = new Uint8Array (titleFrameEntryView.buffer, titleFrameEntryView.byteOffset + 0x04, 64);
    this.pocketStation = new Uint8Array (titleFrameEntryView.buffer, titleFrameEntryView.byteOffset + 0x50, 16);
    this.iconPalette   = new Uint16Array(titleFrameEntryView.buffer, titleFrameEntryView.byteOffset + 0x60, 16);
}

/*
Icon Frame(s) (Block 1..15, Frame 1..3) (in first block of file only)
16x16 (256) pixels. 4 bits for palette index.
    | 7 6 5 4 | 3 2 1 0 |
    |  Right  |  Left   |
*/
TitleFrame.prototype.getIconBitmap = function(idx) {
    if (idx >= this.numIcons[0]) {
        throw new Error("Ask for icon " + idx + " when this file only has " + this.numIcons[0] + " icons (and they are 0 indexed)");
    }
    const currentFrame = this.directory.getFrameNumber();
    return this.directory.mcard.getFrame(currentFrame, idx + 1);
}

/*
Helper that provides the number of seconds per frame in ms.
For static or corrupted files return 0.
*/
TitleFrame.prototype.frameIntervalInMs = function() {
    if (this.iconFlag[0] == 0x12) return 16/50*1000;
    if (this.iconFlag[0] == 0x13) return 11/50*1000;
    return 0;
}

/*
Shift-JIS Character Set (16bit) (used in Title Frames)
Can contain japanese or english text, english characters are encoded like so:
  81h,40h      --> SPC
  81h,43h..97h --> punctuation marks
  82h,4Fh..58h --> "0..9"
  82h,60h..79h --> "A..Z"
  82h,81h..9Ah --> "a..z"
Titles shorter than 32 characters are padded with 00h-bytes.
Note: The titles are <usually> in 16bit format (even if they consist of raw english text),
however, the BIOS memory card manager does also accept 8bit characters 20h..7Fh
(so, in the 8bit form, the title could be theoretically up to 64 characters long, but,
nethertheless, the BIOS displays only max 32 chars).
*/
TitleFrame.prototype.getTitle = function() {
    let result = "";
    for (let i = 0; i < this.titleSJIS.byteLength && this.titleSJIS[i] != 0; ++i) {
        let code = this.titleSJIS[i];

        if (!(code in JIStoUnicode) && (i + 1) < this.titleSJIS.byteLength) {
            code = code << 8;
            ++i;
            code |= this.titleSJIS[i];
        }
        if (code in JIStoUnicode) {
            result += String.fromCharCode(JIStoUnicode[code]);
        }
    }
    return toHalfWidth(result);
}

/*
From: https://stackoverflow.com/questions/14592364/utf-16-to-utf-8-conversion-in-javascript
*/
const shiftCharCode = Δ => c => String.fromCharCode(c.charCodeAt(0) + Δ);
const toFullWidth = str => str.replace(/[!-~]/g, shiftCharCode(0xFEE0));
const toHalfWidth = str => str.replace(/[！-～]/g, shiftCharCode(-0xFEE0));
