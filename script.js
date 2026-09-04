// ==========================================
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ==========================================
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwqmA6Vx2yHUmQ0xiLDNDN_nGDcoXHU-PipKqTP1B1cEtDr707-frJ66IC7PdRKq93ZTg/exec";

let currentDate = new Date();

// Carrega os dados salvos do localStorage de forma segura
let events = JSON.parse(localStorage.getItem('calendar_events')) || {};
let notes = JSON.parse(localStorage.getItem('calendar_notes')) || [];

let holidays = {};

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function loadSavedEvents() {
  const localData = localStorage.getItem('calendar_events');
  if (localData) {
    try {
      events = JSON.parse(localData);
    } catch (e) {
      console.error("Erro ao carregar eventos locais:", e);
      events = {};
    }
  }
}

// ==========================================
// 1. NAVEGAÇÃO POR ABAS
// ==========================================
window.openTab = function(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  const selectedTab = document.getElementById(tabId);
  if (selectedTab) selectedTab.classList.add('active');

  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }

  if (tabId === 'tab-ferias') renderFeriasList();
  if (tabId === 'tab-aniversarios') renderAniversariosList();
  if (tabId === 'tab-recados') renderNotes();
};

// ==========================================
// 2. BUSCA DE FERIADOS E DADOS REMOTOS (LOCAL FIRST + TIMEOUT)
// ==========================================
async function fetchHolidays(year) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    if (!response.ok) return;
    const data = await response.json();
    
    holidays[year] = {};
    data.forEach(h => {
      holidays[year][h.date] = h.name;
    });
  } catch (error) {
    console.error("Erro ao buscar feriados nacionais:", error);
  }
}

async function loadDataFromGoogleSheets() {
  const year = currentDate.getFullYear();
  const monthName = monthNames[currentDate.getMonth()];
  const monthDisplay = `${monthName} ${year}`;

  // AbortController para cancelar a chamada se o Apps Script demorar mais de 6 segundos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`${GOOGLE_WEB_APP_URL}?month=${encodeURIComponent(monthDisplay)}`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return;
    
    const remoteEvents = await response.json();

    // Valida se o retorno é um objeto válido de eventos e não uma mensagem de erro
    if (remoteEvents && typeof remoteEvents === 'object' && !remoteEvents.status) {
      // Mescla os dados da nuvem mantendo os locais
      events = { ...events, ...remoteEvents };
      localStorage.setItem('calendar_events', JSON.stringify(events));
      
      // Atualiza a tela com as novidades trazidas do Google Sheets
      await renderCalendar();
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn("Nuvem demorou a responder. O sistema manteve a exibição rápida via cache.");
    } else {
      console.warn("Aviso: Não foi possível carregar os dados atualizados da planilha.", error);
    }
  }
}

// ==========================================
// 3. RENDERIZAÇÃO DO CALENDÁRIO
// ==========================================
async function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  if (!holidays[year]) {
    await fetchHolidays(year);
  }

  const display = document.getElementById('month-year-display');
  if (display) display.textContent = `${monthNames[month]} ${year}`;
  
  const grid = document.getElementById('calendar-days');
  if (!grid) return;
  
  grid.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.style.border = 'none';
    emptyCell.style.cursor = 'default';
    emptyCell.style.background = 'transparent';
    grid.appendChild(emptyCell);
  }

  const today = new Date();

  for (let day = 1; day <= totalDays; day++) {
    const dayCell = document.createElement('div');
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    dayCell.innerHTML = `<strong>${day}</strong>`;

    if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
      dayCell.classList.add('today');
    }

    // 1. Feriado Nacional
    if (holidays[year] && holidays[year][dateStr]) {
      const holidayTag = document.createElement('span');
      holidayTag.className = 'event-tag type-feriado';
      holidayTag.textContent = `🇧🇷 ${holidays[year][dateStr]}`;
      holidayTag.title = `Feriado: ${holidays[year][dateStr]}`;
      dayCell.appendChild(holidayTag);
    }

    // 2. Eventos e Plantões
    if (events[dateStr]) {
      events[dateStr].forEach(ev => {
        const tag = document.createElement('span');
        let prefix = '🚨';
        let typeClass = '';

        if (ev.type === 'ferias') {
          typeClass = 'type-ferias';
          prefix = '🏖️';
        } else if (ev.type === 'aniversario') {
          typeClass = 'type-aniversario';
          prefix = '🎂';
        } else if (ev.type === 'plantao') {
          const isDiurno = ev.shift === '06h-18h' || ev.shift === 'diurno';
          typeClass = isDiurno ? 'type-plantao-diurno' : 'type-plantao-noturno';
          prefix = isDiurno ? '☀️' : '🌙';
        } else {
          typeClass = `type-${ev.type}`;
        }

        tag.className = `event-tag ${typeClass}`;
        let teamShortStr = ev.team ? ev.team.join(', ') : '';
        tag.textContent = `${prefix} ${teamShortStr}`;
        dayCell.appendChild(tag);
      });
    }

    dayCell.addEventListener('click', () => {
      openDayModal(dateStr);
    });

    grid.appendChild(dayCell);
  }
}

// ==========================================
// 4. DETALHES DO DIA (MODAL APENAS LEITURA)
// ==========================================
function openDayModal(dateStr) {
  const modal = document.getElementById('day-modal');
  const title = document.getElementById('modal-date-title');
  const list = document.getElementById('modal-events-list');

  if (!modal || !title || !list) return;

  const [year, month, day] = dateStr.split('-');
  const formattedDate = `${day}/${month}/${year}`;

  title.innerText = `Plantões e Eventos - ${formattedDate}`;
  list.innerHTML = '';

  if (holidays[year] && holidays[year][dateStr]) {
    const holidayItem = document.createElement('div');
    holidayItem.style.cssText = 'padding: 10px; background: #f8d7da; color: #721c24; border-radius: 6px; font-weight: bold; border-left: 4px solid #dc3545; margin-bottom: 8px;';
    holidayItem.innerHTML = `🇧🇷 Feriado Nacional: ${holidays[year][dateStr]}`;
    list.appendChild(holidayItem);
  }

  if (events[dateStr] && events[dateStr].length > 0) {
    events[dateStr].forEach((ev) => {
      const p = document.createElement('div');
      p.style.cssText = "padding: 10px; border-radius: 6px; background: #f8f9fa; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 8px;";
      
      let borderColor = "#dc3545"; 
      let shiftLabel = '🗓️ Dia Todo';

      if (ev.type === 'plantao') {
        const isDiurno = ev.shift === '06h-18h' || ev.shift === 'diurno';
        borderColor = isDiurno ? "#ffc107" : "#17a2b8"; 
        shiftLabel = isDiurno ? '☀️ Diurno (06h às 18h)' : '🌙 Noturno (18h às 06h)';
      } else if (ev.type === 'ferias') {
        borderColor = "#28a745";
      } else if (ev.type === 'aniversario') {
        borderColor = "#6f42c1";
      }

      p.style.borderLeft = `5px solid ${borderColor}`;
      let teamStr = ev.team ? ev.team.join(', ') : 'Sem servidor atribuído';

      p.innerHTML = `
        <div>
          <strong style="color: #333;">[${ev.type.toUpperCase()}] ${shiftLabel}</strong><br>
          👤 <strong>Servidor(es):</strong> ${teamStr}<br>
          ${ev.notes ? `📝 <em>${ev.notes}</em>` : ''}
        </div>
      `;
      list.appendChild(p);
    });
  } else if (!holidays[year] || !holidays[year][dateStr]) {
    list.innerHTML += '<p style="color: #6c757d; font-size: 0.95rem;">Nenhum agendamento para este dia.</p>';
  }

  modal.style.display = 'flex';
}

window.closeDayModal = function() {
  const modal = document.getElementById('day-modal');
  if (modal) modal.style.display = 'none';
};

window.onclick = function(event) {
  const modal = document.getElementById('day-modal');
  if (event.target === modal) {
    closeDayModal();
  }
};

// ==========================================
// 5. RENDERIZAÇÃO DAS OUTRAS ABAS
// ==========================================
function renderFeriasList() {
  const container = document.getElementById('tab-ferias');
  if (!container) return;
  container.innerHTML = '<h2>🏖️ Controle de Férias da Equipe</h2><br>';

  let count = 0;
  Object.keys(events).forEach(date => {
    events[date].filter(ev => ev.type === 'ferias').forEach(ev => {
      count++;
      const [year, month, day] = date.split('-');
      container.innerHTML += `
        <div style="padding:10px; background:#e8f5e9; margin-bottom:8px; border-radius:6px; border-left:4px solid #28a745;">
          <strong>Data: ${day}/${month}/${year}</strong> - Servidor: ${ev.team.join(', ')} 
          ${ev.notes ? `(${ev.notes})` : ''}
        </div>`;
    });
  });

  if (count === 0) container.innerHTML += '<p>Nenhuma férias registrada.</p>';
}

function renderAniversariosList() {
  const container = document.getElementById('tab-aniversarios');
  if (!container) return;
  container.innerHTML = '<h2>🎂 Aniversariantes</h2><br>';

  let count = 0;
  Object.keys(events).forEach(date => {
    events[date].filter(ev => ev.type === 'aniversario').forEach(ev => {
      count++;
      const [year, month, day] = date.split('-');
      container.innerHTML += `
        <div style="padding:10px; background:#f3e5f5; margin-bottom:8px; border-radius:6px; border-left:4px solid #6f42c1;">
          <strong>Data: ${day}/${month}/${year}</strong> - Servidor: ${ev.team.join(', ')} 
          ${ev.notes ? `(${ev.notes})` : ''}
        </div>`;
    });
  });

  if (count === 0) container.innerHTML += '<p>Nenhum aniversário registrado.</p>';
}

// ==========================================
// 6. QUADRO DE RECADOS
// ==========================================
function renderNotes() {
  const container = document.getElementById('notes-list');
  if (!container) return;

  container.innerHTML = '';

  if (notes.length === 0) {
    container.innerHTML = '<p style="color: #6c757d;">Nenhum recado publicado até o momento.</p>';
    return;
  }

  notes.forEach((note) => {
    const card = document.createElement('div');
    card.style.cssText = 'background: #fff3cd; border-left: 5px solid #ffc107; padding: 12px 15px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

    card.innerHTML = `
      <div>
        <strong>📌 Aviso:</strong> ${note.text}<br>
        <small style="color: #6c757d;">Publicado em: ${note.date}</small>
      </div>
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 7. EVENT LISTENERS E INICIALIZAÇÃO INSTANTÂNEA
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  loadSavedEvents();

  // 1. Desenha o calendário INSTANTANEAMENTE usando dados locais
  await renderCalendar();
  renderNotes();

  // 2. Busca na nuvem sem travar a interface
  loadDataFromGoogleSheets();

  // Navegação de Mês
  document.getElementById('prev-month')?.addEventListener('click', async () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    await renderCalendar();
    loadDataFromGoogleSheets();
  });

  document.getElementById('next-month')?.addEventListener('click', async () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    await renderCalendar();
    loadDataFromGoogleSheets();
  });
});
