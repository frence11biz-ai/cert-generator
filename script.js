// ---- Configuration ----
// Embedded data URL works when opened directly from disk (file://).
// Falls back to the PNG file when served over HTTP without certificate-template.js.
const TEMPLATE_SRC = window.CERTIFICATE_TEMPLATE_SRC || 'certificate_template.png';
const CANVAS_W = 2000;
const CANVAS_H = 1414;

// Area (in template pixel coordinates) where the placeholder name used to be.
// Text will be vertically centered around this baseline and left-aligned at NAME_X.
const NAME_X = 150;          // left margin, matches "CERTIFICATE" heading alignment
const NAME_BASELINE_Y = 685; // baseline position for the name text
const NAME_MAX_WIDTH = 1720; // max width before the ribbon graphic on the right
const NAME_MAX_FONT = 92;    // starting font size (px)
const NAME_MIN_FONT = 40;    // smallest we will shrink to
const NAME_COLOR = 'rgb(92, 180, 31)'; // matches template green

// ---- Element refs ----
const form = document.getElementById('certForm');
const nameInput = document.getElementById('fullName');
const generateBtn = document.getElementById('generateBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const canvas = document.getElementById('certCanvas');
const ctx = canvas.getContext('2d');
const previewImage = document.getElementById('previewImage');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');

const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));

let templateImage = null;
let templateLoadPromise = null;

function loadTemplateImage() {
  if (templateLoadPromise) return templateLoadPromise;
  templateLoadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      templateImage = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load template image: ${TEMPLATE_SRC}`));
    img.src = TEMPLATE_SRC;
  });
  return templateLoadPromise;
}

// Prefer Baloo 2 when available; fall back to sans-serif if the CDN font can't load.
async function loadFont() {
  try {
    await document.fonts.load('800 92px "Baloo 2"');
    await document.fonts.ready;
  } catch (err) {
    console.warn('Baloo 2 unavailable, using fallback font.', err);
  }
}

function fitFontSize(text, maxWidth, maxFont, minFont) {
  let fontSize = maxFont;
  ctx.font = `800 ${fontSize}px "Baloo 2", sans-serif`;
  let width = ctx.measureText(text).width;
  while (width > maxWidth && fontSize > minFont) {
    fontSize -= 2;
    ctx.font = `800 ${fontSize}px "Baloo 2", sans-serif`;
    width = ctx.measureText(text).width;
  }
  return fontSize;
}

async function renderCertificate(name) {
  await Promise.all([loadTemplateImage(), loadFont()]);

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // Draw the clean template (placeholder text already removed)
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.drawImage(templateImage, 0, 0, CANVAS_W, CANVAS_H);

  // Determine a font size that fits the available width
  const fontSize = fitFontSize(name, NAME_MAX_WIDTH, NAME_MAX_FONT, NAME_MIN_FONT);
  ctx.font = `800 ${fontSize}px "Baloo 2", sans-serif`;
  ctx.fillStyle = NAME_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, NAME_X, NAME_BASELINE_Y);

  return canvas.toDataURL('image/png', 1.0);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();

  if (!name) {
    form.classList.add('was-validated');
    nameInput.focus();
    return;
  }
  form.classList.remove('was-validated');

  // Loading state
  generateBtn.disabled = true;
  btnText.textContent = 'Generating…';
  btnSpinner.classList.remove('d-none');

  try {
    const dataUrl = await renderCertificate(name);
    previewImage.src = dataUrl;
    previewModal.show();
  } catch (err) {
    console.error(err);
    alert('Something went wrong while generating the certificate. Please try again.');
  } finally {
    generateBtn.disabled = false;
    btnText.textContent = 'Generate Certificate';
    btnSpinner.classList.add('d-none');
  }
});

downloadPdfBtn.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;

  // Canvas is 2000x1414 -> ratio matches A4 landscape (297 x 210 mm) almost exactly
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgData = canvas.toDataURL('image/png', 1.0);
  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);

  const name = nameInput.value.trim().replace(/\s+/g, '_') || 'Certificate';
  pdf.save(`Certificate_of_Participation_${name}.pdf`);
});
