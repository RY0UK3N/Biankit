import * as pdfjsLib from "../../node_modules/pdfjs-dist/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "../../node_modules/pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).href;

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const info = await window.papel.appInfo();
document.title = info.title;
document.querySelector("#app-title").textContent = info.title;
document.body.dataset.tool = info.id;
document.documentElement.style.setProperty("--accent", info.accent);
document.documentElement.style.setProperty("--accent-soft", `${info.accent}18`);

const pinButton = document.querySelector("#pin-window");
function renderPinState(value) {
  const state = typeof value === "boolean"
    ? { enabled: value, active: value, suspended: false }
    : value;
  pinButton.classList.toggle("is-pinned", state.active);
  pinButton.classList.toggle("is-suspended", state.suspended);
  pinButton.setAttribute("aria-pressed", String(state.enabled));
  pinButton.querySelector(".pin-label").textContent = state.suspended
    ? "Pausado"
    : state.enabled ? "Fixado" : "Livre";
  pinButton.title = state.suspended
    ? "Fixação pausada enquanto a janela está maximizada"
    : state.enabled ? "Permitir que outras janelas fiquem por cima" : "Manter acima das outras janelas";
}
renderPinState(info.alwaysOnTop);
window.papel.onPinState(renderPinState);
pinButton.addEventListener("click", async () => {
  const enabled = pinButton.getAttribute("aria-pressed") !== "true";
  renderPinState(await window.papel.setAlwaysOnTop(enabled));
});

const copy = {
  merge: {
    eyebrow: "COMBINAR DOCUMENTOS",
    title: "Junte PDFs, sem complicação.",
    subtitle: "Arraste os arquivos, coloque na ordem certa e salve um único PDF.",
  },
  organize: {
    eyebrow: "ORGANIZAR PÁGINAS",
    title: "Cada página no seu lugar.",
    subtitle: "Reordene, gire ou remova páginas visualmente antes de salvar.",
  },
  split: {
    eyebrow: "SEPARAR DOCUMENTO",
    title: "Divida só o que precisa.",
    subtitle: "Extraia cada página ou crie novos PDFs a partir de intervalos.",
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function baseName(filePath) {
  return String(filePath).split(/[\\/]/).pop() || filePath;
}

function isPdf(filePath) {
  return String(filePath).toLocaleLowerCase().endsWith(".pdf");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Documento PDF";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showToast(message, type = "normal") {
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (toast.className = "toast"), 3800);
}

function errorMessage(error) {
  const message = error?.message || String(error);
  if (/encrypted/i.test(message)) return "Este PDF é protegido por senha e não pôde ser aberto.";
  if (/invalid pdf/i.test(message)) return "O arquivo parece estar corrompido ou não é um PDF válido.";
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

function hero() {
  const text = copy[info.id];
  return `
    <section class="hero">
      <div class="eyebrow">${text.eyebrow}</div>
      <h1>${text.title}</h1>
      <p class="subtitle">${text.subtitle}</p>
    </section>`;
}

function dropMarkup({ multiple, label }) {
  return `
    <section class="dropzone" id="dropzone" tabindex="0" role="button">
      <div class="drop-content">
        <div class="drop-icon">＋</div>
        <strong>${label}</strong>
        <small>ou clique para escolher ${multiple ? "os arquivos" : "um arquivo"}</small>
      </div>
    </section>`;
}

function setupDropzone({ multiple, onFiles }) {
  const zone = document.querySelector("#dropzone");
  const choose = async () => {
    const paths = await window.papel.choosePdfs(multiple);
    if (paths.length) onFiles(paths.map((path) => ({ path, name: baseName(path) })));
  };
  zone.addEventListener("click", choose);
  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") choose();
  });
  for (const eventName of ["dragenter", "dragover"]) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("is-over");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove("is-over");
    });
  }
  zone.addEventListener("drop", (event) => {
    const files = [...event.dataTransfer.files]
      .map((file) => ({ path: window.papel.pathForFile(file), name: file.name, size: file.size }))
      .filter((file) => isPdf(file.path));
    if (!files.length) return showToast("Arraste apenas arquivos PDF.", "error");
    onFiles(multiple ? files : files.slice(0, 1));
  });
}

function successMarkup(title, detail, buttonLabel = "Mostrar arquivo") {
  return `
    ${hero()}
    <section class="panel success">
      <div class="success-mark">✓</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(detail)}</p>
      <div class="button-group" style="justify-content:center">
        <button class="button" id="again">Fazer outro</button>
        <button class="button primary" id="reveal">${buttonLabel}</button>
      </div>
    </section>`;
}

function busy(button, label) {
  button.disabled = true;
  button.dataset.original = button.textContent;
  button.innerHTML = `<span class="progress"><span class="spinner"></span>${label}</span>`;
  return () => {
    button.disabled = false;
    button.textContent = button.dataset.original;
  };
}

// Juntar PDFs
function startMerge() {
  let files = [];

  const initial = () => {
    app.innerHTML = `${hero()}${dropMarkup({ multiple: true, label: "Arraste seus PDFs aqui" })}`;
    setupDropzone({ multiple: true, onFiles: addFiles });
  };

  const addFiles = (incoming) => {
    const known = new Set(files.map((file) => file.path.toLocaleLowerCase()));
    for (const file of incoming) {
      if (!known.has(file.path.toLocaleLowerCase())) files.push(file);
    }
    renderList();
  };

  const renderList = () => {
    app.innerHTML = `
      ${hero()}
      <section class="panel">
        <div class="panel-head"><h2>Arquivos na ordem final</h2><span>${files.length} ${files.length === 1 ? "arquivo" : "arquivos"}</span></div>
        <ul class="file-list" id="file-list">
          ${files.map((file, index) => `
            <li class="file-row" draggable="true" data-index="${index}">
              <span class="handle" title="Arraste para reordenar">⠿</span>
              <div class="file-copy"><strong title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</strong><small>${formatBytes(file.size)}</small></div>
              <button class="icon-button danger remove" aria-label="Remover arquivo" data-index="${index}">✕</button>
            </li>`).join("")}
        </ul>
      </section>
      <div class="button-row">
        <button class="text-button" id="clear">Limpar lista</button>
        <div class="button-group">
          <button class="button" id="add">＋ Adicionar</button>
          <button class="button primary" id="merge">Juntar PDFs</button>
        </div>
      </div>`;

    document.querySelectorAll(".remove").forEach((button) => button.addEventListener("click", () => {
      files.splice(Number(button.dataset.index), 1);
      files.length ? renderList() : initial();
    }));
    document.querySelector("#clear").addEventListener("click", initialReset);
    document.querySelector("#add").addEventListener("click", async () => {
      const paths = await window.papel.choosePdfs(true);
      addFiles(paths.map((path) => ({ path, name: baseName(path) })));
    });
    document.querySelector("#merge").addEventListener("click", merge);
    setupSortable(document.querySelector("#file-list"), (from, to) => {
      const [moved] = files.splice(from, 1);
      files.splice(to, 0, moved);
      renderList();
    });
  };

  const initialReset = () => { files = []; initial(); };
  const merge = async () => {
    if (!files.length) return;
    const outputPath = await window.papel.chooseOutput(files[0].path, "unido");
    if (!outputPath) return;
    const button = document.querySelector("#merge");
    const restore = busy(button, "Juntando…");
    try {
      const result = await window.papel.merge(files.map((file) => file.path), outputPath);
      app.innerHTML = successMarkup("PDF criado com sucesso", `${result.pageCount} páginas reunidas em um único documento.`);
      document.querySelector("#again").addEventListener("click", initialReset);
      document.querySelector("#reveal").addEventListener("click", () => window.papel.reveal(result.outputPath));
    } catch (error) {
      restore();
      showToast(errorMessage(error), "error");
    }
  };
  initial();
}

function setupSortable(container, onMove, { showInsertion = false, autoScroll = false } = {}) {
  let from = null;
  let dropTarget = null;
  let pointer = null;
  let scrollFrame = null;
  const clearInsertion = () => {
    container.querySelectorAll(".drop-before, .drop-after").forEach((target) => {
      target.classList.remove("drop-before", "drop-after");
    });
    dropTarget = null;
  };

  const updateInsertion = (clientX, clientY) => {
    if (from === null) return;
    if (!showInsertion) {
      const target = document.elementFromPoint(clientX, clientY)?.closest("[draggable=true]");
      dropTarget = target && container.contains(target)
        ? { to: Number(target.dataset.index), after: false }
        : dropTarget;
      return;
    }
    const items = [...container.querySelectorAll("[draggable=true]")];
    const direct = document.elementFromPoint(clientX, clientY)?.closest("[draggable=true]");
    let target = direct && container.contains(direct) ? direct : null;

    if (!target && items.length) {
      target = items.reduce((nearest, item) => {
        const bounds = item.getBoundingClientRect();
        const dx = clientX - Math.max(bounds.left, Math.min(clientX, bounds.right));
        const dy = clientY - Math.max(bounds.top, Math.min(clientY, bounds.bottom));
        const distance = dx * dx + dy * dy;
        return !nearest || distance < nearest.distance ? { item, distance } : nearest;
      }, null)?.item;
    }

    clearInsertion();
    if (!target || Number(target.dataset.index) === from) return;
    const bounds = target.getBoundingClientRect();
    const after = clientY > bounds.bottom || (
      clientY >= bounds.top && clientX >= bounds.left + bounds.width / 2
    );
    target.classList.add(after ? "drop-after" : "drop-before");
    dropTarget = { to: Number(target.dataset.index), after };
  };

  const autoScrollFrame = () => {
    if (from === null || !pointer) {
      scrollFrame = null;
      return;
    }
    const bounds = container.getBoundingClientRect();
    const edge = Math.min(110, Math.max(64, bounds.height * 0.24));
    const withinHorizontalReach = pointer.x >= bounds.left - 70 && pointer.x <= bounds.right + 70;
    let speed = 0;

    if (withinHorizontalReach && pointer.y < bounds.top + edge && pointer.y >= bounds.top - 55) {
      const strength = Math.min(1, (bounds.top + edge - pointer.y) / edge);
      speed = -Math.ceil(3 + 19 * strength * strength);
    } else if (withinHorizontalReach && pointer.y > bounds.bottom - edge && pointer.y <= bounds.bottom + 55) {
      const strength = Math.min(1, (pointer.y - (bounds.bottom - edge)) / edge);
      speed = Math.ceil(3 + 19 * strength * strength);
    }

    container.classList.toggle("scrolling-up", speed < 0 && container.scrollTop > 0);
    container.classList.toggle("scrolling-down", speed > 0 && container.scrollTop < container.scrollHeight - container.clientHeight);
    if (speed) {
      container.scrollTop += speed;
      updateInsertion(pointer.x, pointer.y);
    }
    scrollFrame = requestAnimationFrame(autoScrollFrame);
  };

  const trackPointer = (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    updateInsertion(pointer.x, pointer.y);
    if (autoScroll && scrollFrame === null) scrollFrame = requestAnimationFrame(autoScrollFrame);
  };

  const stopTracking = () => {
    document.removeEventListener("dragover", trackPointer);
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    pointer = null;
    container.classList.remove("scrolling-up", "scrolling-down");
  };

  const finishMove = () => {
    if (from !== null && dropTarget && from !== dropTarget.to) {
      onMove(from, dropTarget.to, { after: dropTarget.after });
    }
    stopTracking();
    clearInsertion();
    from = null;
  };

  container.querySelectorAll("[draggable=true]").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      if (event.target.closest("button")) {
        event.preventDefault();
        return;
      }
      from = Number(item.dataset.index);
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-papel-item", String(from));
      document.addEventListener("dragover", trackPointer);
      if (autoScroll && scrollFrame === null) scrollFrame = requestAnimationFrame(autoScrollFrame);
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      stopTracking();
      clearInsertion();
      from = null;
    });
    item.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes("application/x-papel-item")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      trackPointer(event);
    });
    item.addEventListener("drop", (event) => {
      if (from === null) return;
      event.preventDefault();
      event.stopPropagation();
      trackPointer(event);
      finishMove();
    });
  });

  container.addEventListener("dragover", (event) => {
    if (from === null || !event.dataTransfer.types.includes("application/x-papel-item")) return;
    event.preventDefault();
    trackPointer(event);
  });
  container.addEventListener("drop", (event) => {
    if (from === null) return;
    event.preventDefault();
    trackPointer(event);
    finishMove();
  });
}

// Organizar páginas
function startOrganize() {
  let input = null;
  let pages = [];
  let originalPages = [];
  let history = [];

  const clonePages = (source = pages) => source.map((page) => ({ ...page }));
  const remember = () => {
    history.push(clonePages());
    if (history.length > 30) history.shift();
  };
  const hasChanges = () => pages.length !== originalPages.length || pages.some((page, position) => (
    page.index !== originalPages[position]?.index || page.rotation !== 0
  ));
  const undo = () => {
    if (!history.length) return;
    pages = history.pop();
    renderPages();
  };

  const initial = () => {
    app.classList.remove("organize-workspace");
    input = null;
    pages = [];
    originalPages = [];
    history = [];
    app.innerHTML = `${hero()}${dropMarkup({ multiple: false, label: "Arraste um PDF aqui" })}`;
    setupDropzone({ multiple: false, onFiles: ([file]) => load(file) });
  };

  const load = async (file) => {
    app.classList.remove("organize-workspace");
    input = file;
    app.innerHTML = `${hero()}<section class="panel loading-pages"><span class="progress"><span class="spinner"></span>Lendo e preparando as páginas…</span></section>`;
    try {
      const bytes = await window.papel.readPdf(file.path);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
      pages = [];
      for (let index = 0; index < pdf.numPages; index += 1) {
        const page = await pdf.getPage(index + 1);
        const viewport = page.getViewport({ scale: 0.34 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        pages.push({ index, rotation: 0, preview: canvas.toDataURL("image/jpeg", 0.78) });
      }
      originalPages = clonePages();
      history = [];
      renderPages();
    } catch (error) {
      showToast(errorMessage(error), "error");
      initial();
    }
  };

  const renderPages = () => {
    const previousScrollTop = document.querySelector("#page-grid")?.scrollTop || 0;
    app.classList.add("organize-workspace");
    const changed = hasChanges();
    app.innerHTML = `
      ${hero()}
      <section class="panel organize-panel">
        <div class="panel-head">
          <div><h2 title="${escapeHtml(input.path)}">${escapeHtml(input.name)}</h2><span class="organize-state ${changed ? "is-changed" : ""}">${changed ? "Alterações prontas" : "Ordem original"}</span></div>
          <span>${pages.length} ${pages.length === 1 ? "página" : "páginas"}</span>
        </div>
        <div class="organize-toolbar">
          <span class="organize-hint"><span class="handle" aria-hidden="true">⠿</span> Arraste para reposicionar</span>
          <span class="organize-tools">
            <button class="mini-action" id="undo" ${history.length ? "" : "disabled"} title="Desfazer a última alteração (Ctrl+Z)">↶ Desfazer</button>
            <button class="mini-action" id="restore" ${changed ? "" : "disabled"} title="Recuperar todas as páginas na ordem original">Restaurar</button>
          </span>
        </div>
        <div class="page-grid" id="page-grid">
          ${pages.map((page, position) => {
            const quarterTurn = Math.abs(page.rotation % 180) === 90;
            return `
              <article class="page-card" draggable="true" data-index="${position}">
                <span class="position-badge" title="Posição ${position + 1} no PDF final">${position + 1}</span>
                <span class="page-grip" aria-hidden="true">⠿</span>
                <div class="page-preview"><img alt="Página ${page.index + 1}" src="${page.preview}" style="transform:rotate(${page.rotation}deg) scale(${quarterTurn ? ".72" : "1"})"></div>
                <div class="page-meta">
                  <span class="page-number">Original ${page.index + 1}</span>
                  <span class="page-actions">
                    <button class="icon-button rotate-left" draggable="false" data-index="${position}" aria-label="Girar página ${position + 1} para a esquerda" title="Girar para a esquerda">↺</button>
                    <button class="icon-button rotate-right" draggable="false" data-index="${position}" aria-label="Girar página ${position + 1} para a direita" title="Girar para a direita">↻</button>
                    <button class="icon-button danger delete-page" draggable="false" data-index="${position}" aria-label="Remover página ${position + 1}" title="Remover página">✕</button>
                  </span>
                </div>
              </article>`;
          }).join("")}
        </div>
      </section>
      <div class="button-row organize-footer">
        <button class="text-button" id="change">Escolher outro PDF</button>
        <button class="button primary" id="save">Salvar novo PDF</button>
      </div>`;

    const pageGrid = document.querySelector("#page-grid");
    pageGrid.scrollTop = previousScrollTop;
    document.querySelector("#change").addEventListener("click", initial);
    document.querySelector("#save").addEventListener("click", save);
    document.querySelector("#undo").addEventListener("click", undo);
    document.querySelector("#restore").addEventListener("click", () => {
      remember();
      pages = clonePages(originalPages);
      renderPages();
    });
    for (const [selector, turn] of [[".rotate-left", -90], [".rotate-right", 90]]) {
      document.querySelectorAll(selector).forEach((button) => button.addEventListener("click", () => {
        remember();
        const page = pages[Number(button.dataset.index)];
        page.rotation = (page.rotation + turn + 360) % 360;
        renderPages();
      }));
    }
    document.querySelectorAll(".delete-page").forEach((button) => button.addEventListener("click", () => {
      if (pages.length === 1) return showToast("O PDF precisa manter pelo menos uma página.", "error");
      remember();
      pages.splice(Number(button.dataset.index), 1);
      renderPages();
      showToast("Página removida. Use Desfazer para recuperá-la.");
    }));
    setupSortable(pageGrid, (from, to, { after }) => {
      let destination = to + (after ? 1 : 0);
      if (from < destination) destination -= 1;
      if (destination === from) return;
      remember();
      const [moved] = pages.splice(from, 1);
      pages.splice(destination, 0, moved);
      renderPages();
    }, { showInsertion: true, autoScroll: true });
  };

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z" && input && history.length) {
      event.preventDefault();
      undo();
    }
  });

  const save = async () => {
    const outputPath = await window.papel.chooseOutput(input.path, "organizado");
    if (!outputPath) return;
    const button = document.querySelector("#save");
    const restore = busy(button, "Salvando…");
    try {
      const plan = pages.map(({ index, rotation }) => ({ index, rotation }));
      const result = await window.papel.organize(input.path, plan, outputPath);
      history = [];
      app.classList.remove("organize-workspace");
      app.innerHTML = successMarkup("Novo PDF salvo", `${result.pageCount} páginas na ordem escolhida.`);
      document.querySelector("#again").addEventListener("click", initial);
      document.querySelector("#reveal").addEventListener("click", () => window.papel.reveal(result.outputPath));
    } catch (error) {
      restore();
      showToast(errorMessage(error), "error");
    }
  };
  initial();
}

// Dividir PDF
function startSplit() {
  let input = null;
  let pageCount = 0;

  const initial = () => {
    input = null;
    pageCount = 0;
    app.innerHTML = `${hero()}${dropMarkup({ multiple: false, label: "Arraste um PDF aqui" })}`;
    setupDropzone({ multiple: false, onFiles: ([file]) => load(file) });
  };

  const load = async (file) => {
    try {
      const bytes = await window.papel.readPdf(file.path);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
      input = file;
      pageCount = pdf.numPages;
      renderOptions();
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  };

  const renderOptions = () => {
    app.innerHTML = `
      ${hero()}
      <section class="panel split-card">
        <div class="document-chip">
          <span class="pdf-badge">PDF</span>
          <div class="file-copy"><strong>${escapeHtml(input.name)}</strong><small>${pageCount} ${pageCount === 1 ? "página" : "páginas"}</small></div>
          <button class="icon-button danger" id="remove-input" title="Escolher outro arquivo">✕</button>
        </div>
        <div class="field">
          <label>Como deseja dividir?</label>
          <div class="choice-row">
            <label class="choice"><input type="radio" name="mode" value="each" checked><strong>Uma página por PDF</strong><small>Cria ${pageCount} arquivos separados</small></label>
            <label class="choice"><input type="radio" name="mode" value="ranges"><strong>Por intervalos</strong><small>Você escolhe os grupos</small></label>
          </div>
        </div>
        <div class="field" id="ranges-field" hidden>
          <label for="ranges">Páginas ou intervalos</label>
          <input id="ranges" placeholder="Ex.: 1-3, 4-6, 9" autocomplete="off">
          <p class="hint">Cada item separado por vírgula vira um novo PDF. Use números de 1 a ${pageCount}.</p>
        </div>
      </section>
      <div class="button-row">
        <button class="text-button" id="change">Escolher outro PDF</button>
        <button class="button primary" id="split">Escolher pasta e dividir</button>
      </div>`;

    document.querySelector("#remove-input").addEventListener("click", initial);
    document.querySelector("#change").addEventListener("click", initial);
    document.querySelectorAll("input[name=mode]").forEach((radio) => radio.addEventListener("change", () => {
      document.querySelector("#ranges-field").hidden = radio.value !== "ranges" || !radio.checked;
    }));
    document.querySelector("#split").addEventListener("click", split);
  };

  const parseGroups = () => {
    const mode = document.querySelector("input[name=mode]:checked").value;
    if (mode === "each") {
      return Array.from({ length: pageCount }, (_, index) => ({ label: `pagina-${index + 1}`, indexes: [index] }));
    }
    const value = document.querySelector("#ranges").value.trim();
    if (!value) throw new Error("Informe as páginas ou intervalos que deseja extrair.");
    return value.split(",").map((part) => {
      const label = part.trim();
      const match = label.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!match) throw new Error(`O intervalo “${label}” não é válido.`);
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (start < 1 || end > pageCount || start > end) throw new Error(`O intervalo “${label}” está fora do documento.`);
      return { label: `paginas-${label.replace(/\s/g, "")}`, indexes: Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i) };
    });
  };

  const split = async () => {
    let groups;
    try { groups = parseGroups(); } catch (error) { return showToast(error.message, "error"); }
    const outputDirectory = await window.papel.chooseFolder();
    if (!outputDirectory) return;
    const button = document.querySelector("#split");
    const restore = busy(button, "Dividindo…");
    try {
      const result = await window.papel.split(input.path, groups, outputDirectory);
      app.innerHTML = successMarkup("PDF dividido com sucesso", `${result.outputs.length} ${result.outputs.length === 1 ? "arquivo criado" : "arquivos criados"}.`, "Abrir pasta");
      document.querySelector("#again").addEventListener("click", initial);
      document.querySelector("#reveal").addEventListener("click", () => window.papel.openFolder(result.outputDirectory));
    } catch (error) {
      restore();
      showToast(errorMessage(error), "error");
    }
  };
  initial();
}

if (info.id === "organize") startOrganize();
else if (info.id === "split") startSplit();
else startMerge();
