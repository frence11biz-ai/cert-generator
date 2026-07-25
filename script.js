// ---- Configuration ----
// Embedded data URL works when opened directly from disk (file://).
// Falls back to the PNG file when served over HTTP without certificate-template.js.
const TEMPLATE_SRC = window.CERTIFICATE_TEMPLATE_SRC || 'certificate_template.png';
const CANVAS_W = 2000;
const CANVAS_H = 1414;

// Name placement (template pixel coordinates).
// Centered on the citation block (paragraph between the green lines: ~x 143–1663).
const NAME_CENTER_X = 903;          // horizontal center of the citation text
const NAME_BASELINE_Y = 670;        // vertically in the blank space above the citation
const NAME_MAX_WIDTH = 1520;        // matches citation text width
const NAME_MAX_FONT = 92;           // starting font size (px)
const NAME_MIN_FONT = 40;           // smallest we will shrink to
const NAME_COLOR = 'rgb(2, 91, 64)'; // matches CERTIFICATE title green

// Firebase Realtime Database (public records)
const FIREBASE_DB_URL = 'https://test-6ae95-default-rtdb.asia-southeast1.firebasedatabase.app';
const RECORDS_URL = `${FIREBASE_DB_URL}/records.json`;

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
const recordsTab = document.getElementById('records-tab');
const refreshRecordsBtn = document.getElementById('refreshRecordsBtn');
const recordsStatus = document.getElementById('recordsStatus');
const recordsTableWrap = document.getElementById('recordsTableWrap');
const recordsBody = document.getElementById('recordsBody');

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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, NAME_CENTER_X, NAME_BASELINE_Y);

  return canvas.toDataURL('image/png', 1.0);
}

async function saveRecord(name) {
  const res = await fetch(RECORDS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      createdAt: new Date().toISOString()
    })
  });
  if (!res.ok) {
    throw new Error(`Failed to save record (${res.status})`);
  }
  return res.json();
}

function formatRecordDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadRecords() {
  recordsStatus.classList.remove('d-none', 'text-danger');
  recordsStatus.classList.add('text-muted');
  recordsStatus.textContent = 'Loading records…';
  recordsTableWrap.classList.add('d-none');
  recordsBody.innerHTML = '';

  try {
    const res = await fetch(RECORDS_URL);
    if (!res.ok) throw new Error(`Failed to load records (${res.status})`);
    const data = await res.json();

    if (!data) {
      recordsStatus.textContent = 'No certificates generated yet.';
      return;
    }

    const rows = Object.entries(data)
      .map(([id, value]) => ({
        id,
        name: (value && value.name) || '—',
        createdAt: (value && value.createdAt) || ''
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    if (!rows.length) {
      recordsStatus.textContent = 'No certificates generated yet.';
      return;
    }

    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-muted">${index + 1}</td>
        <td class="fw-semibold">${escapeHtml(row.name)}</td>
        <td class="text-muted small">${escapeHtml(formatRecordDate(row.createdAt))}</td>
      `;
      recordsBody.appendChild(tr);
    });

    recordsStatus.classList.add('d-none');
    recordsTableWrap.classList.remove('d-none');
  } catch (err) {
    console.error(err);
    recordsStatus.classList.remove('text-muted');
    recordsStatus.classList.add('text-danger');
    recordsStatus.textContent = 'Could not load public records. Please try again.';
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

    // Save to public records (non-blocking for preview; warn if it fails)
    try {
      await saveRecord(name);
    } catch (saveErr) {
      console.error(saveErr);
      alert('Certificate generated, but saving to public records failed.');
    }
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
  pdf.save(`Certificate_of_Completion_${name}.pdf`);
});

recordsTab.addEventListener('shown.bs.tab', () => {
  loadRecords();
});

refreshRecordsBtn.addEventListener('click', () => {
  loadRecords();
});
