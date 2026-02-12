import { Action, ColorZeroBehaviour, Dither, DitherPattern } from "./enums.js";
const body = document.getElementById("body");
const imageSelector = document.getElementById("image_selector");
const tileWidthInput = document.getElementById("tile_width");
const tileHeightInput = document.getElementById("tile_height");
const numPalettesInput = document.getElementById("palette_num");
const colorsPerPaletteInput = document.getElementById("colors_per_palette");
const bitsPerChannelInput = document.getElementById("bits_per_channel");
const fractionOfPixelsInput = document.getElementById("fraction_of_pixels");

// Manual palette placement elements
const manualPaletteToggle = document.getElementById("manual_palette_toggle");
const manualPaletteIndexInput = document.getElementById("manual_palette_index");
const placementCanvas = document.getElementById("placement_canvas");
let manualPlacementEnabled = false;
let manualPaletteMap = null; // Int16Array of palette indices, -1 = unset
let placementTilesX = 0;
let placementTilesY = 0;
const integerInputs = [
    [tileWidthInput, 8],
    [tileHeightInput, 8],
    [numPalettesInput, 8],
    [colorsPerPaletteInput, 16],
    [bitsPerChannelInput, 5],
];
function validateIntegerInput(numberInput) {
    const [inputElement, defaultValue] = numberInput;
    let num = parseInt(inputElement.value, radix);
    if (isNaN(num))
        num = defaultValue;
    const min = parseInt(inputElement.min, radix);
    const max = parseInt(inputElement.max, radix);
    if (num < min)
        num = min;
    if (num > max)
        num = max;
    inputElement.value = num.toString();
}
function validateFloatInput(numberInput) {
    const [inputElement, defaultValue] = numberInput;
    let num = parseFloat(inputElement.value);
    if (isNaN(num))
        num = defaultValue;
    const min = parseFloat(inputElement.min);
    const max = parseFloat(inputElement.max);
    if (num < min)
        num = min;
    if (num > max)
        num = max;
    inputElement.value = num.toFixed(2);
}
const uniqueInput = document.getElementById("unique");
const sharedInput = document.getElementById("shared");
const transparentFromTransparentInput = document.getElementById("transparent_from_transparent");
const transparentFromColorInput = document.getElementById("transparent_from_color");
const indexZeroButtons = [
    uniqueInput,
    sharedInput,
    transparentFromTransparentInput,
    transparentFromColorInput,
];
const indexZeroValues = [
    ColorZeroBehaviour.Unique,
    ColorZeroBehaviour.Shared,
    ColorZeroBehaviour.TransparentFromTransparent,
    ColorZeroBehaviour.TransparentFromColor,
];
const colorZeroAbbreviations = ["u", "s", "t", "tc"];
const sharedColorInput = document.getElementById("shared_color");
const transparentColorInput = document.getElementById("transparent_color");
const defaultColorInput = document.createElement("input");
defaultColorInput.value = "#000000";
const colorValues = [
    defaultColorInput,
    sharedColorInput,
    transparentColorInput,
    transparentColorInput,
];
const ditherOffInput = document.getElementById("dither_off");
const ditherFastInput = document.getElementById("dither_fast");
const ditherSlowInput = document.getElementById("dither_slow");
const ditherButtons = [ditherOffInput, ditherFastInput, ditherSlowInput];
const ditherValues = [Dither.Off, Dither.Fast, Dither.Slow];
const ditherWeightInput = document.getElementById("dither_weight");
const ditherDiagonal4Input = document.getElementById("dither_diagonal4");
const ditherHorizontal4Input = document.getElementById("dither_horizontal4");
const ditherVertical4Input = document.getElementById("dither_vertical4");
const ditherDiagonal2Input = document.getElementById("dither_diagonal2");
const ditherHorizontal2Input = document.getElementById("dither_horizontal2");
const ditherVertical2Input = document.getElementById("dither_vertical2");
const ditherPatternButtons = [
    ditherDiagonal4Input,
    ditherHorizontal4Input,
    ditherVertical4Input,
    ditherDiagonal2Input,
    ditherHorizontal2Input,
    ditherVertical2Input,
];
const ditherPatternValues = [
    DitherPattern.Diagonal4,
    DitherPattern.Horizontal4,
    DitherPattern.Vertical4,
    DitherPattern.Diagonal2,
    DitherPattern.Horizontal2,
    DitherPattern.Vertical2,
];
let sourceImageName = "carina";
let sourceImage = document.getElementById("source_img");
body.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer == null)
        return;
    event.dataTransfer.dropEffect = "move";
});
body.addEventListener("drop", (event) => {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (dt == null)
        return;
    if (dt.files.length > 0) {
        const file = dt.files[0];
        if (file.type.substring(0, 6) === "image/") {
            sourceImageName = file.name.substring(0, file.name.lastIndexOf("."));
            sourceImage.src = URL.createObjectURL(file);
        }
    }
});
imageSelector.addEventListener("change", () => {
    if (imageSelector.files == null)
        return;
    if (imageSelector.files.length > 0) {
        const file = imageSelector.files[0];
        sourceImageName = file.name.substring(0, file.name.lastIndexOf("."));
        sourceImage.src = URL.createObjectURL(file);
    }
});
let inProgress = false;
let quantizedImageDownload = document.createElement("a");
let palettesImageDownload = document.createElement("a");
let quantizedImage = document.createElement("canvas");
let palettesImage = document.createElement("canvas");
let worker = null;
const quantizeButton = document.getElementById("quantizeButton");
const quantizedImages = document.getElementById("quantized_images");
const progress = document.getElementById("progress");
const radix = 10;

// Setup manual placement interactions
function ensureManualMap() {
    const tw = parseInt(tileWidthInput.value, radix);
    const th = parseInt(tileHeightInput.value, radix);
    const tilesX = Math.ceil(sourceImage.width / tw);
    const tilesY = Math.ceil(sourceImage.height / th);
    if (!manualPaletteMap || placementTilesX !== tilesX || placementTilesY !== tilesY) {
        manualPaletteMap = new Int16Array(tilesX * tilesY);
        for (let i = 0; i < manualPaletteMap.length; i++) manualPaletteMap[i] = -1;
        placementTilesX = tilesX;
        placementTilesY = tilesY;
    }
}

function positionPlacementCanvas() {
    const rect = sourceImage.getBoundingClientRect();
    placementCanvas.style.left = (rect.left + window.scrollX) + "px";
    placementCanvas.style.top = (rect.top + window.scrollY) + "px";
    placementCanvas.width = sourceImage.width;
    placementCanvas.height = sourceImage.height;
    placementCanvas.style.width = sourceImage.width + "px";
    placementCanvas.style.height = sourceImage.height + "px";
}

function drawPlacementOverlay() {
    const ctx = placementCanvas.getContext("2d");
    ctx.clearRect(0, 0, placementCanvas.width, placementCanvas.height);
    const tw = parseInt(tileWidthInput.value, radix);
    const th = parseInt(tileHeightInput.value, radix);
    // draw filled tiles for assigned palettes
    if (manualPaletteMap) {
        for (let ty = 0; ty < placementTilesY; ty++) {
            for (let tx = 0; tx < placementTilesX; tx++) {
                const idx = ty * placementTilesX + tx;
                const p = manualPaletteMap[idx];
                if (p >= 0) {
                    const hue = (p * 360 / Math.max(1, parseInt(numPalettesInput.value, radix))) % 360;
                    ctx.fillStyle = `hsla(${hue},70%,50%,0.28)`;
                    ctx.fillRect(tx * tw, ty * th, tw, th);
                }
            }
        }
    }
    // draw grid
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    const tilesX = placementTilesX;
    const tilesY = placementTilesY;
    for (let x = 0; x <= tilesX; x++) {
        ctx.beginPath();
        ctx.moveTo(x * tw + 0.5, 0);
        ctx.lineTo(x * tw + 0.5, placementCanvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= tilesY; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * th + 0.5);
        ctx.lineTo(placementCanvas.width, y * th + 0.5);
        ctx.stroke();
    }
}

function enableManualPlacement(enabled) {
    manualPlacementEnabled = enabled;
    if (enabled) {
        ensureManualMap();
        positionPlacementCanvas();
        placementCanvas.style.display = "block";
        drawPlacementOverlay();
    }
    else {
        placementCanvas.style.display = "none";
    }
}

placementCanvas.addEventListener("click", (ev) => {
    if (!manualPlacementEnabled)
        return;
    const rect = placementCanvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const tw = parseInt(tileWidthInput.value, radix);
    const th = parseInt(tileHeightInput.value, radix);
    const tx = Math.floor(x / tw);
    const ty = Math.floor(y / th);
    if (tx < 0 || ty < 0 || tx >= placementTilesX || ty >= placementTilesY)
        return;
    const idx = ty * placementTilesX + tx;
    let paletteIndex = parseInt(manualPaletteIndexInput.value, radix);
    const maxP = Math.max(0, parseInt(numPalettesInput.value, radix) - 1);
    if (isNaN(paletteIndex) || paletteIndex < 0) paletteIndex = 0;
    if (paletteIndex > maxP) paletteIndex = maxP;
    manualPaletteMap[idx] = paletteIndex;
    drawPlacementOverlay();
});

// react to toggles and inputs
manualPaletteToggle.addEventListener("change", () => {
    enableManualPlacement(manualPaletteToggle.checked);
});
manualPaletteIndexInput.addEventListener("change", () => {
    let v = parseInt(manualPaletteIndexInput.value, radix);
    if (isNaN(v) || v < 0) v = 0;
    const maxP = Math.max(0, parseInt(numPalettesInput.value, radix) - 1);
    if (v > maxP) v = maxP;
    manualPaletteIndexInput.value = v.toString();
});
window.addEventListener("resize", () => {
    if (manualPlacementEnabled) {
        positionPlacementCanvas();
        drawPlacementOverlay();
    }
});
sourceImage.addEventListener("load", () => {
    if (manualPlacementEnabled) {
        ensureManualMap();
        positionPlacementCanvas();
        drawPlacementOverlay();
    }
});
tileWidthInput.addEventListener("change", () => { if (manualPlacementEnabled) { ensureManualMap(); drawPlacementOverlay(); } });
tileHeightInput.addEventListener("change", () => { if (manualPlacementEnabled) { ensureManualMap(); positionPlacementCanvas(); drawPlacementOverlay(); } });
numPalettesInput.addEventListener("change", () => { if (manualPlacementEnabled) drawPlacementOverlay(); });
quantizeButton.addEventListener("click", () => {
    sourceImage = document.getElementById("source_img");
    if (!inProgress) {
        inProgress = true;
        quantizedImage = document.createElement("canvas");
        quantizedImage.width = sourceImage.width;
        quantizedImage.height = sourceImage.height;
        quantizedImage.style.marginTop = "8px";
        quantizedImage.style.marginLeft = "8px";
        quantizedImageDownload = document.createElement("a");
        quantizedImageDownload.appendChild(quantizedImage);
        palettesImage = document.createElement("canvas");
        palettesImage.width = 16;
        palettesImage.height = sourceImage.height;
        palettesImage.style.marginTop = "8px";
        palettesImage.style.marginLeft = "8px";
        palettesImageDownload = document.createElement("a");
        palettesImageDownload.appendChild(palettesImage);
        const div = document.createElement("div");
        div.appendChild(quantizedImageDownload);
        div.appendChild(palettesImageDownload);
        quantizedImages.prepend(div);
    }
    integerInputs.forEach(validateIntegerInput);
    validateFloatInput([fractionOfPixelsInput, 0.1]);
    validateFloatInput([ditherWeightInput, 0.5]);
    const colorZeroBehaviour = selectedValue(indexZeroButtons, indexZeroValues);
    const colorInput = selectedValue(indexZeroButtons, colorValues);
    const colorZeroValue = hexToColor(colorInput.value);
    const ditherMethod = selectedValue(ditherButtons, ditherValues);
    const ditherPattern = selectedValue(ditherPatternButtons, ditherPatternValues);
    const colorZeroAbbreviation = selectedValue(indexZeroButtons, colorZeroAbbreviations);
    const settingsStr = `-${tileWidthInput.value}x${tileHeightInput.value}-${numPalettesInput.value}p${colorsPerPaletteInput.value}c-${colorZeroAbbreviation}`;
    const totalPaletteColors = parseInt(numPalettesInput.value, radix) *
        parseInt(colorsPerPaletteInput.value, radix);
    if (totalPaletteColors > 256) {
        quantizedImageDownload.download =
            sourceImageName + settingsStr + ".png";
    }
    else {
        quantizedImageDownload.download =
            sourceImageName + settingsStr + ".bmp";
    }
    palettesImageDownload.download =
        sourceImageName + settingsStr + "-palette.png";
    if (worker)
        worker.terminate();
    worker = new Worker("./worker.js");
    worker.onmessage = function (event) {
        const data = event.data;
        if (data.action === Action.UpdateProgress) {
            progress.value = data.progress;
        }
        else if (data.action === Action.DoneQuantization) {
            inProgress = false;
        }
        else if (data.action === Action.UpdateQuantizedImage) {
            const imageData = data.imageData;
            const quantizedImageData = new window.ImageData(imageData.width, imageData.height);
            for (let i = 0; i < imageData.data.length; i++) {
                quantizedImageData.data[i] = imageData.data[i];
            }
            quantizedImage.width = imageData.width;
            quantizedImage.height = imageData.height;
            const ctx = quantizedImage.getContext("2d");
            ctx.putImageData(quantizedImageData, 0, 0);
            if (imageData.totalPaletteColors > 256) {
                quantizedImageDownload.href = quantizedImage.toDataURL();
            }
            else {
                quantizedImageDownload.href = bmpToDataURL(imageData.width, imageData.height, imageData.paletteData, imageData.colorIndexes);
            }
        }
        else if (data.action === Action.UpdatePalettes) {
            const palettes = data.palettes;
            const paletteDisplayHeight = 16;
            const paletteDisplayWidth = Math.min(16, Math.ceil(512 / data.numColors));
            palettesImage.width = data.numColors * paletteDisplayWidth;
            palettesImage.height = data.numPalettes * paletteDisplayHeight;
            const palCtx = palettesImage.getContext("2d");
            for (let j = 0; j < palettes.length; j += 1) {
                for (let i = 0; i < palettes[j].length; i += 1) {
                    palCtx.fillStyle = `rgb(
                        ${Math.round(palettes[j][i][0])},
                        ${Math.round(palettes[j][i][1])},
                        ${Math.round(palettes[j][i][2])})`;
                    palCtx.fillRect(i * paletteDisplayWidth, j * paletteDisplayHeight, paletteDisplayWidth, paletteDisplayHeight);
                }
            }
            palettesImageDownload.href = palettesImage.toDataURL();
        }
    };
    const msg = {
        action: Action.StartQuantization,
        imageData: imageDataFrom(sourceImage),
        quantizationOptions: {
            tileWidth: parseInt(tileWidthInput.value, radix),
            tileHeight: parseInt(tileHeightInput.value, radix),
            numPalettes: parseInt(numPalettesInput.value, radix),
            colorsPerPalette: parseInt(colorsPerPaletteInput.value, radix),
            bitsPerChannel: parseInt(bitsPerChannelInput.value, radix),
            fractionOfPixels: parseFloat(fractionOfPixelsInput.value),
            colorZeroBehaviour: colorZeroBehaviour,
            colorZeroValue: colorZeroValue,
            dither: ditherMethod,
            ditherWeight: parseFloat(ditherWeightInput.value),
            ditherPattern: ditherPattern,
        },
    };
    // include manual palette map if user enabled manual placement
    if (manualPlacementEnabled && manualPaletteMap) {
        msg.quantizationOptions.manualPaletteMap = {
            tilesX: placementTilesX,
            tilesY: placementTilesY,
            map: manualPaletteMap,
        };
        // transfer the underlying buffer for efficiency
        worker.postMessage(msg, [manualPaletteMap.buffer]);
    }
    else {
        worker.postMessage(msg);
    }
});
function hexToColor(colorStr) {
    return [
        parseInt(colorStr.slice(1, 3), 16),
        parseInt(colorStr.slice(3, 5), 16),
        parseInt(colorStr.slice(5, 7), 16),
    ];
}
function selectedValue(radioInputs, values) {
    for (let i = 0; i < radioInputs.length; i++) {
        if (radioInputs[i].checked) {
            return values[i];
        }
    }
    throw "No radio inputs selected";
}
function imageDataFrom(img) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;
    context.drawImage(img, 0, 0);
    return context.getImageData(0, 0, img.width, img.height);
}
function bmpToDataURL(width, height, paletteData, colorIndexes) {
    const bmpFileSize = 54 + paletteData.length + colorIndexes.length;
    const bmpData = new Uint8ClampedArray(bmpFileSize);
    bmpData[0] = 66;
    bmpData[1] = 77;
    write32Le(bmpData, 2, bmpFileSize);
    write32Le(bmpData, 6, 0);
    write32Le(bmpData, 0xa, 54 + paletteData.length);
    write32Le(bmpData, 0xe, 40);
    write32Le(bmpData, 0x12, width);
    write32Le(bmpData, 0x16, height);
    write16Le(bmpData, 0x1a, 1);
    write16Le(bmpData, 0x1c, 8);
    write32Le(bmpData, 0x1e, 0);
    write32Le(bmpData, 0x22, colorIndexes.length);
    write32Le(bmpData, 0x26, 2835);
    write32Le(bmpData, 0x2a, 2835);
    write32Le(bmpData, 0x2e, 256);
    write32Le(bmpData, 0x32, 0);
    for (let i = 0; i < paletteData.length; i++) {
        bmpData[i + 54] = paletteData[i];
    }
    const imageDataAddress = 54 + paletteData.length;
    for (let i = 0; i < colorIndexes.length; i++) {
        bmpData[i + imageDataAddress] = colorIndexes[i];
    }
    return "data:image/bmp;base64," + uint8ToBase64(bmpData);
}
function uint8ToBase64(arr) {
    return btoa(Array(arr.length)
        .fill("")
        .map((_, i) => String.fromCharCode(arr[i]))
        .join(""));
}
function write32Le(bmpData, index, value) {
    bmpData[index] = value % 256;
    value = Math.floor(value / 256);
    bmpData[index + 1] = value % 256;
    value = Math.floor(value / 256);
    bmpData[index + 2] = value % 256;
    value = Math.floor(value / 256);
    bmpData[index + 3] = value % 256;
}
function write16Le(bmpData, index, value) {
    bmpData[index] = value % 256;
    value = Math.floor(value / 256);
    bmpData[index + 1] = value % 256;
}
//# sourceMappingURL=script.js.map