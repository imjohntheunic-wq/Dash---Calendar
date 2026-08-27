// ==========================================
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ==========================================
// URL da sua Web App do Google Apps Script
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwqmA6Vx2yHUmQ0xiLDNDN_nGDcoXHU-PipKqTP1B1cEtDr707-frJ66IC7PdRKq93ZTg/exec";

// Data atual de referência para navegação
let currentDate = new Date();

// Carrega os dados salvos do localStorage
let events = JSON.parse(localStorage.getItem('calendar_events')) || {};
let notes = JSON.parse(localStorage.getItem('calendar_notes')) || [];

// Memória local para os feriados nacionais por ano
let holidays = {};

// Lista temporária de datas selecionadas em lote
let selectedDatesList = [];

// Nomes dos meses em português
const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Carrega os eventos salvos no navegador ao iniciar
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
// 2. BUSCA DE FERIADOS E DADOS REMOTOS
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
  try {
    const monthDisplay = document.getElementById('month-year-display')?.textContent || 'Setembro 2026';
    const response = await fetch(`${GOOGLE_WEB_APP_URL}?month=${encodeURIComponent(monthDisplay)}`);
    
    if (!response.ok) return;
    
    const remoteEvents = await response.json();

    if (remoteEvents && typeof remoteEvents === 'object' && !remoteEvents.status) {
      // Atualiza os eventos com o que foi lido da planilha e re-renderiza a tela
      events = remoteEvents;
      localStorage.setItem('calendar_events', JSON.stringify(events));
      await renderCalendar();
    }
  } catch (error) {
    console.warn("Aviso: Não foi possível carregar os dados da planilha.", error);
  }
}

// ==========================================
// 3. CONTROLE DOS CAMPOS DO FORMULÁRIO
// ==========================================
function updateFormFields() {
  const eventTypeSelect = document.getElementById('event-type');
  const shiftContainer = document.getElementById('shift-container');
  const endDateInput = document.getElementById('event-date-end');
  
  const type = eventTypeSelect ? eventTypeSelect.value : 'plantao';

  if (type === 'plantao') {
    if (shiftContainer) shiftContainer.style.display = 'block';
    if (endDateInput) {
      endDateInput.value = '';
      endDateInput.disabled = true;
    }
  } else if (type === 'ferias') {
    if (shiftContainer) shiftContainer.style.display = 'none';
    if (endDateInput) endDateInput.disabled = false;
  } else { // aniversario
    if (shiftContainer) shiftContainer.style.display = 'none';
    if (endDateInput) {
      endDateInput.value = '';
      endDateInput.disabled = true;
    }
  }
}

function renderSelectedDatesTags() {
  const container = document.getElementById('selected-dates-container');
  if (!container) return;
  container.innerHTML = '';

  selectedDatesList.forEach((dateStr, index) => {
    const [year, month, day] = dateStr.split('-');
    const tag = document.createElement('span');
    tag.style.cssText = 'background: #007bff; color: white; padding: 4px 8px; border-radius: 12px; font-size: 13px; display: flex; align-items: center; gap: 5px;';
    tag.innerHTML = `
      📅 ${day}/${month}/${year}
      <strong style="cursor: pointer; color: #ffd1d1;" onclick="removeSelectedDate(${index})">✕</strong>
    `;
    container.appendChild(tag);
  });
}

window.removeSelectedDate = function(index) {
  selectedDatesList.splice(index, 1);
  renderSelectedDatesTags();
};

// ==========================================
// 4. RENDERIZAÇÃO DO CALENDÁRIO
// ==========================================
async function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Garante que os feriados do ano navegando foram carregados
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

    // 1. RENDERIZA FERIADO NACIONAL (se houver)
    if (holidays[year] && holidays[year][dateStr]) {
      const holidayTag = document.createElement('span');
      holidayTag.className = 'event-tag type-feriado';
      holidayTag.textContent = `🇧🇷 ${holidays[year][dateStr]}`;
      holidayTag.title = `Feriado: ${holidays[year][dateStr]}`;
      dayCell.appendChild(holidayTag);
    }

    // 2. RENDERIZA PLANTÕES E EVENTOS DA EQUIPE
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

          if (isDiurno) {
            typeClass = 'type-plantao-diurno';
            prefix = '☀️';
          } else {
            typeClass = 'type-plantao-noturno';
            prefix = '🌙';
          }
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
      const inputSingle = document.getElementById('event-date-input');
      if (inputSingle) inputSingle.value = dateStr;
      showDayEvents(dateStr);
    });

    grid.appendChild(dayCell);
  }
}

// ==========================================
// 5. SINCRONIZAÇÃO COM GOOGLE SHEETS
// ==========================================
async function syncWithGoogleSheets() {
  const monthDisplay = document.getElementById('month-year-display')?.textContent || '';
  
  const daysData = {};
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    daysData[day] = [];

    if (events[dateStr]) {
      events[dateStr].forEach(ev => {
        if (ev.type === 'ferias') {
          const endDateStr = ev.endDate ? ` (até ${ev.endDate})` : ''; 
          daysData[day].push(`🏖️ Férias: ${ev.team.join(', ')}${endDateStr}`);
        } else if (ev.type === 'aniversario') {
          daysData[day].push(`🎂 Aniv.: ${ev.team.join(', ')}`);
        } else if (ev.type === 'plantao') {
          const isNoturno = ev.shift === '18h-06h' || ev.shift === 'noturno';
          const prefix = isNoturno ? '🌙 Plantão N:' : '☀️ Plantão D:';
          daysData[day].push(`${prefix} ${ev.team.join(', ')}`);
        }
      });
    }
  }

  try {
    await fetch(GOOGLE_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthYear: monthDisplay,
        daysData: daysData
      })
    });

    alert(`Escala e Resumo enviados com sucesso no modelo padrão para a aba "${monthDisplay}"!`);
  } catch (error) {
    console.error('Erro ao conectar com a planilha:', error);
    alert('Não foi possível conectar à planilha. Verifique a URL e a conexão.');
  }
}

// ==========================================
// 6. DETALHES DO DIA E EXCLUSÃO DE EVENTOS
// ==========================================
function showDayEvents(date) {
  const container = document.getElementById('event-list');
  if (!container) return;

  const [year, month, day] = date.split('-');
  const formattedDate = `${day}/${month}/${year}`;
  
  container.innerHTML = `<strong>Escala para: ${formattedDate}</strong><br><br>`;

  // Se a data for um feriado nacional, exibe o aviso
  if (holidays[year] && holidays[year][date]) {
    container.innerHTML += `
      <div style="padding: 8px; background: #f8d7da; color: #721c24; border-radius: 6px; margin-bottom: 10px; font-weight: bold; border-left: 4px solid #dc3545;">
        🇧🇷 Feriado Nacional: ${holidays[year][date]}
      </div>
    `;
  }

  if (events[date] && events[date].length > 0) {
    events[date].forEach((ev, index) => {
      const p = document.createElement('div');
      p.style.cssText = "margin-bottom: 8px; padding: 10px; border-radius: 6px; background: #f8f9fa;";
      
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

      p.style.borderLeft = `4px solid ${borderColor}`;

      let teamStr = ev.team ? ev.team.join(', ') : 'Sem servidor atribuído';

      p.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <strong>[${ev.type.toUpperCase()}] ${shiftLabel}</strong><br>
            👤 <strong>Servidor(es):</strong> ${teamStr}<br>
            ${ev.notes ? `📝 <em>${ev.notes}</em>` : ''}
          </div>
          <button onclick="deleteEvent('${date}', ${index})" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">
            🗑️ Excluir
          </button>
        </div>
      `;
      container.appendChild(p);
    });
  } else if (!holidays[year] || !holidays[year][date]) {
    container.innerHTML += 'Nenhum agendamento para este dia.';
  }
}

window.deleteEvent = async function(dateStr, index) {
  if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;

  events[dateStr].splice(index, 1);

  if (events[dateStr].length === 0) {
    delete events[dateStr];
  }

  localStorage.setItem('calendar_events', JSON.stringify(events));

  await renderCalendar();
  showDayEvents(dateStr);

  if (confirm("Evento removido! Deseja atualizar e remover esta alteração também na Planilha do Google Sheets?")) {
    await syncWithGoogleSheets();
  }
};

// ==========================================
// 7. RENDERIZAÇÃO DAS OUTRAS ABAS
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
// 8. QUADRO DE RECADOS
// ==========================================
function renderNotes() {
  const container = document.getElementById('notes-list');
  if (!container) return;

  container.innerHTML = '';

  if (notes.length === 0) {
    container.innerHTML = '<p style="color: #6c757d;">Nenhum recado publicado até o momento.</p>';
    return;
  }

  notes.forEach((note, index) => {
    const card = document.createElement('div');
    card.style.cssText = 'background: #fff3cd; border-left: 5px solid #ffc107; padding: 12px 15px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

    card.innerHTML = `
      <div>
        <strong>📌 Aviso:</strong> ${note.text}<br>
        <small style="color: #6c757d;">Publicado em: ${note.date}</small>
      </div>
      <button onclick="deleteNote(${index})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Excluir</button>
    `;

    container.appendChild(card);
  });
}

window.deleteNote = function(index) {
  notes.splice(index, 1);
  localStorage.setItem('calendar_notes', JSON.stringify(notes));
  renderNotes();
};

// ==========================================
// 9. EVENT LISTENERS E INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {

  loadSavedEvents();

  document.getElementById('event-type')?.addEventListener('change', updateFormFields);

  document.getElementById('btn-add-date')?.addEventListener('click', () => {
    const dateInput = document.getElementById('event-date-input');
    const dateValue = dateInput ? dateInput.value : '';

    if (!dateValue) {
      alert('Por favor, escolha uma data no campo antes de adicionar.');
      return;
    }

    if (selectedDatesList.includes(dateValue)) {
      alert('Esta data já foi adicionada!');
      return;
    }

    selectedDatesList.push(dateValue);
    if (dateInput) dateInput.value = '';
    renderSelectedDatesTags();
  });

  document.getElementById('event-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const type = document.getElementById('event-type')?.value || 'plantao';
    const shiftSelect = document.getElementById('event-shift');
    const shiftValue = shiftSelect ? shiftSelect.value : '06h-18h';
    const endDateInput = document.getElementById('event-date-end');
    const endDateStr = endDateInput ? endDateInput.value : '';

    const server1 = document.getElementById('server-1')?.value || '';
    const server2 = document.getElementById('server-2')?.value || '';
    const extraServer = document.getElementById('extra-server')?.value.trim() || '';
    const notesText = document.getElementById('event-notes')?.value || '';

    // Formata a data final caso seja férias (ex: 01/09/2026)
    let formattedEndDate = '';
    if (endDateStr) {
      const [ey, em, ed] = endDateStr.split('-');
      formattedEndDate = `${ed}/${em}/${ey}`;
    }

    if (type === 'ferias' && endDateStr && selectedDatesList.length > 0) {
      let startDateCursor = new Date(selectedDatesList[0] + 'T00:00:00');
      const lastDate = new Date(endDateStr + 'T00:00:00');

      while (startDateCursor <= lastDate) {
        const y = startDateCursor.getFullYear();
        const m = String(startDateCursor.getMonth() + 1).padStart(2, '0');
        const d = String(startDateCursor.getDate()).padStart(2, '0');
        const dKey = `${y}-${m}-${d}`;

        if (!selectedDatesList.includes(dKey)) {
          selectedDatesList.push(dKey);
        }
        startDateCursor.setDate(startDateCursor.getDate() + 1);
      }
    }

    if (selectedDatesList.length === 0) {
      alert('Por favor, adicione pelo menos uma data à lista antes de salvar.');
      return;
    }

    if (!server1) {
      alert('Por favor, selecione pelo menos o Servidor 1.');
      return;
    }

    let team = [server1];
    if (server2 && server2 !== server1) team.push(server2);
    if (extraServer && !team.includes(extraServer)) team.push(extraServer);

    // Salva o evento em todas as datas do período
    selectedDatesList.forEach(dateKey => {
      if (!events[dateKey]) events[dateKey] = [];

      // Evita duplicar o mesmo tipo no mesmo dia
      events[dateKey] = events[dateKey].filter(ev => !(ev.type === type && ev.team.join() === team.join()));

      events[dateKey].push({
        type: type,
        shift: type === 'plantao' ? shiftValue : 'Integral',
        team: team,
        notes: notesText,
        endDate: type === 'ferias' ? formattedEndDate : null
      });
    });

    localStorage.setItem('calendar_events', JSON.stringify(events));

    const lastDateAdded = selectedDatesList[0];
    selectedDatesList = [];
    renderSelectedDatesTags();
    
    e.target.reset();
    updateFormFields();

    await renderCalendar();
    showDayEvents(lastDateAdded);

    if (confirm("Evento(s) salvo(s) com sucesso! Deseja sincronizar agora com o Google Sheets?")) {
      await syncWithGoogleSheets();
    }
  });

  document.getElementById('note-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('note-text');
    const text = input ? input.value.trim() : '';

    if (!text) return;

    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} às ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    notes.unshift({ text, date: formattedDate });
    localStorage.setItem('calendar_notes', JSON.stringify(notes));

    if (input) input.value = '';
    renderNotes();
  });

 document.getElementById('prev-month')?.addEventListener('click', async () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    await renderCalendar();
    await loadDataFromGoogleSheets(); // Busca da planilha para o novo mês
  });

  document.getElementById('next-month')?.addEventListener('click', async () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    await renderCalendar();
    await loadDataFromGoogleSheets(); // Busca da planilha para o novo mês
  });

  // Inicializa a interface do sistema
  await renderCalendar();
  updateFormFields();
  renderNotes();

  // Tenta sincronizar agendamentos salvos na nuvem
  loadDataFromGoogleSheets();

});