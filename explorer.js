import { supabase } from "./config.js";

// --- State Management ---
let allLevels = [];

// =========================================
// 🟢 SEKTOR 1: DATA AGGREGATOR
// =========================================

/**
 * Helper untuk optimasi gambar Cloudinary secara on-the-fly
 */
function optimizeCloudinary(url) {
    if (!url || !url.includes("cloudinary")) return url;
    // Menambahkan f_auto (format otomatis) dan q_auto (kualitas otomatis)
    return url.replace("/upload/", "/upload/f_auto,q_auto/");
}

/**
 * Menstandarisasi perbedaan kolom antara tabel Sekolah & Private
 */
function standardizeData(rawItem, source) {
    const m = rawItem.materi;
    if (!m) return null;

    return {
        id: m.id,
        title: m.judul || m.title, 
        description: m.deskripsi || m.description, 
        detail: m.detail,
        image_url: optimizeCloudinary(m.image_url), 
        level_kode: m.levels?.kode || "ROBOT",
        level_id: m.level_id,
        tanggal: rawItem.tanggal,
        source: source 
    };
}

async function loadLiveMissions() {
    const [resSekolah, resPrivate] = await Promise.all([
        supabase.from('pertemuan_kelas').select('tanggal, materi:materi_id(id, title, description, image_url, level_id, levels(kode))').order('tanggal', {ascending: false}).limit(10),
        supabase.from('pertemuan_private').select('tanggal, materi:materi_id(id, judul, deskripsi, image_url, level_id, levels(kode))').order('tanggal', {ascending: false}).limit(10)
    ]);

    const combined = [
        ...(resSekolah.data || []).map(item => standardizeData(item, 'sekolah')),
        ...(resPrivate.data || []).map(item => standardizeData(item, 'private'))
    ].filter(Boolean).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

    const unique = [];
    const map = new Map();
    for (const item of combined) {
        if (!map.has(item.id)) { map.set(item.id, true); unique.push(item); }
    }

    renderCards(unique.slice(0, 8), "live-missions-list");
}

async function loadLevelRows() {
    const container = document.getElementById("level-rows-container");
    container.innerHTML = ""; 

    for (const lvl of allLevels) {
        const [resSekolah, resPrivate] = await Promise.all([
            supabase.from('pertemuan_kelas').select('tanggal, materi:materi_id!inner(id, title, description, image_url, level_id, levels!inner(kode))').eq('materi.level_id', lvl.id).order('tanggal', {ascending: false}).limit(15),
            supabase.from('pertemuan_private').select('tanggal, materi:materi_id!inner(id, judul, deskripsi, image_url, level_id, levels!inner(kode))').eq('materi.level_id', lvl.id).order('tanggal', {ascending: false}).limit(15)
        ]);

        const combined = [
            ...(resSekolah.data || []).map(i => standardizeData(i, 'sekolah')),
            ...(resPrivate.data || []).map(i => standardizeData(i, 'private'))
        ].filter(Boolean).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

        const unique = [];
        const map = new Map();
        combined.forEach(item => { if (!map.has(item.id)) { map.set(item.id, true); unique.push(item); } });

        if (unique.length > 0) {
            const rowHtml = `
                <section class="feed-section" id="row-${lvl.kode}">
                    <div class="section-header">
                        <h2>${getIconByLevel(lvl.kode)} ${lvl.kode} Recent History</h2>
                    </div>
                    <div class="horizontal-scroll" id="list-${lvl.id}" data-level-row="${lvl.kode}"></div>
                </section>`;
            container.insertAdjacentHTML("beforeend", rowHtml);
            renderCards(unique, `list-${lvl.id}`);
        }
    }
}

// =========================================
// 🟢 SEKTOR 2: UI & RENDERING
// =========================================

function renderCards(items, containerId) {
    const list = document.getElementById(containerId);
    if (!list) return;

    list.innerHTML = items.map(item => {
        const tgl = new Date(item.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        
        // Render Media: Foto atau Icon Fallback
        const mediaDisplay = item.image_url 
            ? `<img src="${item.image_url}" class="card-img-main" loading="lazy" alt="${item.title}">`
            : `<div class="card-icon-fallback">${getIconByLevel(item.level_kode)}</div>`;

        return `
            <div class="materi-card" onclick="openModal('${item.id}', '${item.tanggal}', '${item.source}')">
                <div class="card-image">
                    ${mediaDisplay}
                </div>
                <div class="card-content">
                    <span class="level-badge">${item.level_kode}</span>
                    <h3>${item.title}</h3>
                    <p>${item.description || 'Lihat misi ini...'}</p>
                    <small>📅 ${tgl} | ${item.source === 'private' ? '🏠' : '🏫'}</small>
                </div>
            </div>`;
    }).join("");
}

function getIconByLevel(kode) {
    const icons = { 'Kiddy': '🧩', 'Beginner': '⚙️', 'Robotic': '🤖', 'Terapi Wicara': '🗣️' };
    return icons[kode] || '🚀';
}

// =========================================
// 🟢 SEKTOR 3: MODAL LOGIC (HERO OVERLAY)
// =========================================

window.openModal = async (materiId, tanggal, source) => {
    const modal = document.getElementById("modal-explorer");
    const table = source === 'private' ? 'materi_private' : 'materi';
    
    // Tarik detail materi
    const { data, error } = await supabase.from(table).select('*, levels(kode)').eq('id', materiId).single();
    if (error || !data) return;

    // 1. Update Visual (Hero Area)
    const modalImg = document.getElementById("modal-image");
    if (modalImg) {
        modalImg.src = data.image_url || `https://via.placeholder.com/600x400?text=${data.levels?.kode}+Project`;
    }

    // 2. Update Overlay Info (Judul, Level, Tgl)
    document.getElementById("modal-title").textContent = data.judul || data.title;
    document.getElementById("modal-level").textContent = data.levels?.kode || "ROBOTIC";
    
    const tglParsed = new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById("modal-date").textContent = `${tglParsed}`;

    // 3. Update Body Info
    document.getElementById("modal-description").textContent = data.deskripsi || data.description || "Misi robotik Robopanda.";
    document.getElementById("modal-detail").textContent = data.detail || "Detail misi sedang disiapkan.";

    modal.classList.add("active");
    document.body.style.overflow = "hidden";
};

// =========================================
// 🟢 SEKTOR 4: INITIALIZATION & FILTER
// =========================================

function filterByLevel(kode, btn) {
    document.querySelectorAll(".tab-item").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    const allSections = document.querySelectorAll(".feed-section");
    const liveWrapper = document.getElementById("live-missions-wrapper");

    if (kode === "all") {
        if (liveWrapper) liveWrapper.style.display = "block";
        allSections.forEach(s => {
            s.style.display = "block";
            const listContainer = s.querySelector('[data-level-row]');
            if (listContainer) {
                listContainer.classList.remove("grid-layout");
                listContainer.classList.add("horizontal-scroll");
            }
        });
    } else {
        if (liveWrapper) liveWrapper.style.display = "none";
        allSections.forEach(s => {
            if (s.id === `row-${kode}`) {
                s.style.display = "block";
                const listContainer = s.querySelector('[data-level-row]');
                if (listContainer) {
                    listContainer.classList.remove("horizontal-scroll");
                    listContainer.classList.add("grid-layout");
                }
            } else {
                s.style.display = "none";
            }
        });
    }
}

async function init() {
    const { data: levels } = await supabase.from('levels').select('*').order('kode');
    allLevels = levels || [];

    const tabsContainer = document.getElementById("levelTabs");
    // Tombol "Semua" sudah ada di HTML, kita hanya beri logic klik
    const btnAll = document.querySelector('.tab-item[data-level="all"]');
    if (btnAll) btnAll.onclick = (e) => filterByLevel("all", e.target);

    allLevels.forEach(lvl => {
        const btn = document.createElement("button");
        btn.className = "tab-item";
        btn.textContent = lvl.kode;
        btn.onclick = (e) => filterByLevel(lvl.kode, e.target);
        tabsContainer.appendChild(btn);
    });

    await loadLiveMissions();
    await loadLevelRows();
}

function closeModal() {
    document.getElementById("modal-explorer").classList.remove("active");
    document.body.style.overflow = "auto";
}

document.getElementById("closeModal").onclick = closeModal;
window.onclick = (e) => { if (e.target.id === "modal-explorer") closeModal(); };

document.addEventListener("DOMContentLoaded", init);