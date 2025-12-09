// --- DOM 元素選取 ---
const currentMonthYear = document.getElementById('currentMonthYear');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const calendarGrid = document.getElementById('calendarGrid');
const newEventInput = document.getElementById('newEventInput');
const addEventBtn = document.getElementById('addEventBtn');
const eventList = document.getElementById('eventList');

// 固定事件 DOM
const recurringEventInput = document.getElementById('recurringEventInput');
const recurringDaySelect = document.getElementById('recurringDaySelect');
const addRecurringBtn = document.getElementById('addRecurringBtn');
const recurringEventList = document.getElementById('recurringEventList');

// 一般 Modal 相關 DOM
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalDailyList = document.getElementById('modal-daily-list');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalEventName = document.getElementById('modal-event-name');
const modalEventStart = document.getElementById('modal-event-start');
const modalEventEnd = document.getElementById('modal-event-end');
const modalEventDesc = document.getElementById('modal-event-desc');
const modalFormContent = document.querySelector('.modal-form-content');
const modalActions = document.querySelector('.modal-actions');
const modalCreateAction = document.querySelector('.modal-create-action');
const showCreateFormBtn = document.getElementById('show-create-form-btn');

// 訊息彈窗 DOM
const msgBackdrop = document.getElementById('message-modal-backdrop');
const msgTitle = document.getElementById('msg-title');
const msgBody = document.getElementById('msg-body');
const msgConfirmBtn = document.getElementById('msg-confirm-btn');
const msgCancelBtn = document.getElementById('msg-cancel-btn');

// --- 全局變數 ---
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let draggedEvent = null;
let recurringEvents = [];
const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

let currentEditingEvent = { date: null, id: null, mode: 'create' };
let userEvents = [];
let placedEvents = {}; 

// --- [新增] 時間轉換輔助函式 (將 "HH:MM" 轉為 分鐘數) ---
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// --- [新增] 檢查時間衝突函式 ---
function checkTimeConflict(date, newStartStr, newEndStr, ignoreId) {
    // 如果沒有設定時間，就不算衝突
    if (!newStartStr || !newEndStr) return false;

    const newStart = timeToMinutes(newStartStr);
    const newEnd = timeToMinutes(newEndStr);

    // 1. 檢查該日期的「普通事件」
    if (placedEvents[date]) {
        for (const event of placedEvents[date]) {
            // 排除自己 (編輯時)
            if (event.id === ignoreId) continue;
            
            // 如果對方沒設定時間，略過
            if (!event.startTime || !event.endTime) continue;

            const existingStart = timeToMinutes(event.startTime);
            const existingEnd = timeToMinutes(event.endTime);

            // 判斷重疊公式：新開始 < 舊結束 && 新結束 > 舊開始
            if (newStart < existingEnd && newEnd > existingStart) {
                return true; // 發現衝突
            }
        }
    }

    // 2. 檢查該日期的「固定事件」
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    for (const recurEvent of recurringEvents) {
        // 排除自己
        if (recurEvent.id === ignoreId) continue;

        // 必須是同一星期幾，且不是例外日期
        const isException = recurEvent.exceptions && recurEvent.exceptions.includes(date);
        if (recurEvent.dayOfWeek === dayOfWeek && !isException) {
            
            if (!recurEvent.startTime || !recurEvent.endTime) continue;

            const existingStart = timeToMinutes(recurEvent.startTime);
            const existingEnd = timeToMinutes(recurEvent.endTime);

            if (newStart < existingEnd && newEnd > existingStart) {
                return true; // 發現衝突
            }
        }
    }

    return false; // 無衝突
}


// --- 自訂 Alert 與 Confirm 函式 ---
function showAlert(message) {
    msgTitle.textContent = "提示";
    msgBody.textContent = message;
    msgCancelBtn.style.display = 'none'; 
    msgBackdrop.classList.remove('hidden');
    msgConfirmBtn.onclick = () => {
        msgBackdrop.classList.add('hidden');
    };
}

function showConfirm(message, onConfirm) {
    msgTitle.textContent = "確認";
    msgBody.textContent = message;
    msgCancelBtn.style.display = 'inline-block'; 
    msgBackdrop.classList.remove('hidden');

    msgCancelBtn.onclick = () => {
        msgBackdrop.classList.add('hidden');
    };

    msgConfirmBtn.onclick = () => {
        msgBackdrop.classList.add('hidden');
        if (onConfirm) onConfirm();
    };
}

msgBackdrop.addEventListener('click', (e) => {
    if (e.target === msgBackdrop) {
        msgBackdrop.classList.add('hidden');
    }
});


// --- 函式：渲染事件列表 (左側) ---
function renderEventList() {
    eventList.innerHTML = ''; 
    userEvents.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.classList.add('draggable-event');
        eventDiv.setAttribute('draggable', 'true');
        
        eventDiv.dataset.eventName = event.name; 
        eventDiv.dataset.eventId = event.id;
        eventDiv.dataset.startTime = event.startTime || '';
        eventDiv.dataset.endTime = event.endTime || '';
        eventDiv.dataset.description = event.description || ''; 
        
        const eventNameSpan = document.createElement('span');
        let displayText = event.name;
        if (event.placedDates && event.placedDates.length > 0) {
            event.placedDates.sort(); 
            displayText += ` (${event.placedDates.join(', ')})`;
        }
        eventNameSpan.textContent = displayText;
        eventDiv.appendChild(eventNameSpan);

        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = '❌';
        deleteBtn.classList.add('delete-event-btn');
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            userEvents = userEvents.filter(ev => ev.id !== event.id);
            for (const date in placedEvents) {
                placedEvents[date] = placedEvents[date].filter(ev => ev.id !== event.id);
                if (placedEvents[date].length === 0) {
                    delete placedEvents[date];
                }
            }
            saveData(); 
            renderEventList(); 
            renderCalendar(); 
        });
        eventDiv.appendChild(deleteBtn);
        eventList.appendChild(eventDiv);
    });
    addDragListenersToEvents();
}

// --- 函式：新增事件到左側列表 ---
function addEvent() {
    const eventName = newEventInput.value.trim();
    if (eventName) {
        const newId = 'event-' + Date.now();
        const newEvent = { 
            name: eventName, 
            id: newId, 
            startTime: '', 
            endTime: '', 
            description: '',
            placedDates: [] 
        };
        userEvents.push(newEvent);
        newEventInput.value = '';
        renderEventList();
        saveData();
    }
}

// --- 函式：渲染固定事件列表 (左側) ---
function renderRecurringEventList() {
    recurringEventList.innerHTML = '';
    recurringEvents.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.classList.add('recurring-event-item');
        
        const eventName = document.createElement('span');
        eventName.textContent = `${event.name} (${dayNames[event.dayOfWeek]})`;
        eventDiv.appendChild(eventName);

        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = '❌';
        deleteBtn.classList.add('delete-event-btn');
        deleteBtn.title = "刪除此固定事件的所有場次";
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            showConfirm(`確定要刪除「${event.name}」的所有每週場次嗎？`, () => {
                recurringEvents = recurringEvents.filter(ev => ev.id !== event.id);
                saveData(); 
                renderRecurringEventList(); 
                renderCalendar(); 
            });
        });
        eventDiv.appendChild(deleteBtn);
        
        recurringEventList.appendChild(eventDiv);
    });
}

// --- 函式：新增固定事件到左側列表 ---
function addRecurringEvent() {
    const eventName = recurringEventInput.value.trim();
    const dayOfWeek = parseInt(recurringDaySelect.value, 10); 
    
    if (eventName) {
        const newId = 'recur-' + Date.now();
        recurringEvents.push({ 
            name: eventName, 
            dayOfWeek: dayOfWeek, 
            id: newId,
            startTime: '',
            endTime: '',
            description: '',
            exceptions: [] 
        });
        recurringEventInput.value = '';
        renderRecurringEventList(); 
        saveData(); 
        renderCalendar(); 
    }
}

// --- 函式：渲染行事曆 ---
function renderCalendar() {
    calendarGrid.innerHTML = ''; 
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); 
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate(); 
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate(); 
    const today = new Date().toDateString();

    currentMonthYear.textContent = new Date(currentYear, currentMonth).toLocaleString('zh-TW', {
        year: 'numeric',
        month: 'long'
    });

    for (let i = firstDayOfMonth; i > 0; i--) {
        const day = document.createElement('div');
        day.classList.add('calendar-day', 'empty-day');
        day.textContent = daysInPrevMonth - i + 1;
        calendarGrid.appendChild(day);
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const day = document.createElement('div');
        day.classList.add('calendar-day');

        const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        day.dataset.date = dateString;

        const dayNumber = document.createElement('span');
        dayNumber.classList.add('day-number');
        dayNumber.textContent = i;
        day.appendChild(dayNumber);
        
        if (new Date(currentYear, currentMonth, i).toDateString() === today) {
            day.classList.add('current-day');
        }

        day.addEventListener('click', (e) => {
            if (e.target.classList.contains('calendar-day') || e.target.classList.contains('day-number')) {
                currentEditingEvent = { date: dateString, id: null, mode: 'view' }; 
                modalTitle.textContent = `${dateString} 的事件`;
                populateDailyList(dateString);
                modalDailyList.style.display = 'block';
                modalCreateAction.style.display = 'block';
                modalFormContent.style.display = 'none';
                modalActions.style.display = 'none'; 
                modalBackdrop.classList.remove('hidden');
            }
        });
        calendarGrid.appendChild(day);
    }

    const totalDaysDisplayed = firstDayOfMonth + daysInMonth;
    const remainingDays = 42 - totalDaysDisplayed;
    for (let i = 1; i <= remainingDays; i++) {
        const day = document.createElement('div');
        day.classList.add('calendar-day', 'empty-day');
        day.textContent = i;
        calendarGrid.appendChild(day);
    }
    renderPlacedEvents();
    addDragListenersToCalendarDays();
}

// --- 函式：渲染已放置的事件 ---
function renderPlacedEvents() {
    document.querySelectorAll('.calendar-day').forEach(dayElement => {
        const date = dayElement.dataset.date;
        dayElement.querySelectorAll('.placed-event, .placed-recurring-event').forEach(eventEl => eventEl.remove());

        if (date && placedEvents[date]) {
            placedEvents[date].forEach(eventData => {
                const eventDiv = document.createElement('div');
                eventDiv.classList.add('placed-event');
                eventDiv.textContent = eventData.name; 
                eventDiv.dataset.eventId = eventData.id;
                eventDiv.setAttribute('draggable', 'true');

                eventDiv.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    draggedEvent = { ...eventData, sourceDate: date };
                    eventDiv.classList.add('dragging');
                });
                eventDiv.addEventListener('dragend', (e) => {
                    e.stopPropagation();
                    eventDiv.classList.remove('dragging');
                });
                eventDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditModal(eventData, date, 'normal');
                });
                dayElement.appendChild(eventDiv);
            });
        }

        if (date) {
            const dayDate = new Date(date + 'T00:00:00'); 
            const dayOfWeek = dayDate.getDay();
            recurringEvents.forEach(recurEvent => {
                const isException = recurEvent.exceptions && recurEvent.exceptions.includes(date);
                if (recurEvent.dayOfWeek === dayOfWeek && !isException) {
                    const eventDiv = document.createElement('div');
                    eventDiv.classList.add('placed-recurring-event');
                    eventDiv.textContent = recurEvent.name;
                    eventDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEditModal(recurEvent, date, 'recurring');
                    });
                    dayElement.appendChild(eventDiv);
                }
            });
        }
    });
}

function openEditModal(eventData, date, type) {
    currentEditingEvent = { date: date, id: eventData.id, mode: 'edit', type: type };
    modalTitle.textContent = type === 'recurring' ? '編輯固定事件' : '編輯事件';
    modalDailyList.style.display = 'none';
    modalCreateAction.style.display = 'none';
    modalFormContent.style.display = 'block';
    modalActions.style.display = 'flex';
    modalDeleteBtn.style.display = 'inline-block';
    modalSaveBtn.style.display = 'inline-block';
    modalEventName.value = eventData.name;
    modalEventStart.value = eventData.startTime || '';
    modalEventEnd.value = eventData.endTime || '';
    modalEventDesc.value = eventData.description || '';
    modalBackdrop.classList.remove('hidden');
}

function populateDailyList(dateString) {
    modalDailyList.innerHTML = ''; 
    const dayEvents = placedEvents[dateString] ? [...placedEvents[dateString]] : [];
    const dayOfWeek = new Date(dateString + 'T00:00:00').getDay();
    const dayRecurringEvents = recurringEvents.filter(ev => {
        const isException = ev.exceptions && ev.exceptions.includes(dateString);
        return ev.dayOfWeek === dayOfWeek && !isException;
    });

    const unifiedRecurring = dayRecurringEvents.map(ev => ({ ...ev, isRecurring: true }));
    const allEvents = [...dayEvents, ...unifiedRecurring];

    allEvents.sort((a, b) => {
        const timeA = a.startTime;
        const timeB = b.startTime;
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;
        if (timeA && timeB) return timeA.localeCompare(timeB);
        return a.name.localeCompare(b.name);
    });

    if (allEvents.length === 0) {
        modalDailyList.innerHTML = '<p>本日無排程事件</p>';
        return;
    }

    allEvents.forEach(eventData => {
        const item = document.createElement('div');
        item.classList.add('daily-list-item');
        const name = document.createElement('h4');
        name.textContent = eventData.name;
        item.appendChild(name);

        if (eventData.isRecurring) {
            item.classList.add('recurring');
            const recurringInfo = document.createElement('span');
            recurringInfo.style.fontSize = '0.8em';
            recurringInfo.style.color = '#3c763d';
            recurringInfo.textContent = ` (每${dayNames[eventData.dayOfWeek]})`;
            name.appendChild(recurringInfo);
        }
        
        const time = document.createElement('p');
        if (eventData.startTime) {
            time.textContent = `時間: ${eventData.startTime} - ${eventData.endTime || ''}`;
        } else {
            time.textContent = `(未設定時間)`;
        }
        item.appendChild(time);
        
        if (eventData.description) {
            const desc = document.createElement('small');
            desc.textContent = `備註: ${eventData.description.substring(0, 30)}...`;
            item.appendChild(desc);
        }

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = eventData.isRecurring ? 'recurring' : 'normal';
            openEditModal(eventData, dateString, type);
        });
        modalDailyList.appendChild(item);
    });
}

function addDragListenersToEvents() {
    document.querySelectorAll('.draggable-event').forEach(eventDiv => {
        eventDiv.addEventListener('dragstart', (e) => {
            const eventId = e.target.dataset.eventId;
            const originalEvent = userEvents.find(ev => ev.id === eventId);
            if (originalEvent) {
                draggedEvent = { ...originalEvent }; 
            } else {
                draggedEvent = { 
                    name: e.target.dataset.eventName,
                    id: eventId,
                    startTime: e.target.dataset.startTime,
                    endTime: e.target.dataset.endTime,
                    description: e.target.dataset.description,
                    placedDates: []
                };
            }
            e.target.classList.add('dragging');
        });
        eventDiv.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
            draggedEvent = null;
        });
    });
}

function addDragListenersToCalendarDays() {
    document.querySelectorAll('.calendar-day').forEach(dayElement => {
        if (!dayElement.classList.contains('empty-day')) {
            dayElement.addEventListener('dragover', (e) => {
                e.preventDefault(); 
                dayElement.classList.add('drag-over');
            });
            dayElement.addEventListener('dragleave', () => {
                dayElement.classList.remove('drag-over');
            });
            dayElement.addEventListener('drop', (e) => {
                e.preventDefault();
                dayElement.classList.remove('drag-over');
                if (draggedEvent) {
                    const dropDate = dayElement.dataset.date;
                    const eventId = draggedEvent.id;
                    const sourceDate = draggedEvent.sourceDate; 
                    const eventInUserList = userEvents.find(ev => ev.id === eventId);

                    if (sourceDate && placedEvents[sourceDate]) {
                        placedEvents[sourceDate] = placedEvents[sourceDate].filter(ev => ev.id !== eventId);
                        if (placedEvents[sourceDate].length === 0) {
                            delete placedEvents[sourceDate];
                        }
                        if (eventInUserList) {
                            eventInUserList.placedDates = eventInUserList.placedDates.filter(d => d !== sourceDate);
                            if (!eventInUserList.placedDates.includes(dropDate)) {
                                eventInUserList.placedDates.push(dropDate);
                            }
                        }
                    }

                    if (!sourceDate) {
                        if (eventInUserList) {
                            if (!eventInUserList.placedDates.includes(dropDate)) {
                                eventInUserList.placedDates.push(dropDate);
                            }
                        }
                    }
                    if (eventInUserList) {
                        draggedEvent.placedDates = [...eventInUserList.placedDates];
                    }
                    delete draggedEvent.sourceDate; 

                    if (!placedEvents[dropDate]) {
                        placedEvents[dropDate] = [];
                    }
                    placedEvents[dropDate] = placedEvents[dropDate].filter(ev => ev.id !== eventId);
                    placedEvents[dropDate].push(draggedEvent);
                   
                    saveData();
                    renderCalendar(); 
                    renderEventList(); 
                }
            });
        }
    });
}

function saveData() {
    localStorage.setItem('userEvents', JSON.stringify(userEvents));
    localStorage.setItem('placedEvents', JSON.stringify(placedEvents));
    localStorage.setItem('recurringEvents', JSON.stringify(recurringEvents));
}

function loadData() {
    const storedUserEvents = localStorage.getItem('userEvents');
    const storedPlacedEvents = localStorage.getItem('placedEvents');
    const storedRecurringEvents = localStorage.getItem('recurringEvents');
    if (storedUserEvents) {
        userEvents = JSON.parse(storedUserEvents).map(event => ({ ...event, placedDates: event.placedDates || [] }));
    }
    if (storedPlacedEvents) {
        placedEvents = JSON.parse(storedPlacedEvents);
    }
    if (storedRecurringEvents) {
        recurringEvents = JSON.parse(storedRecurringEvents).map(ev => ({
            startTime: '', endTime: '', description: '', exceptions: [], ...ev
        }));
    }
}

prevMonthBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
});

addEventBtn.addEventListener('click', addEvent);
newEventInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addEvent();
});

modalCloseBtn.addEventListener('click', () => modalBackdrop.classList.add('hidden'));
modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) modalBackdrop.classList.add('hidden');
});

showCreateFormBtn.addEventListener('click', () => {
    currentEditingEvent.mode = 'create';
    currentEditingEvent.type = 'normal'; 
    modalTitle.textContent = '新增事件';
    modalDailyList.style.display = 'none';
    modalCreateAction.style.display = 'none';
    modalFormContent.style.display = 'block';
    modalActions.style.display = 'flex';
    modalSaveBtn.style.display = 'inline-block';
    modalDeleteBtn.style.display = 'none';
    modalEventName.value = '';
    modalEventStart.value = '';
    modalEventEnd.value = '';
    modalEventDesc.value = '';
});

// Modal 刪除按鈕
modalDeleteBtn.addEventListener('click', () => {
    const { date, id, type } = currentEditingEvent;

    if (type === 'recurring') {
        const recurEvent = recurringEvents.find(ev => ev.id === id);
        if (recurEvent) {
            showConfirm("確定要從日曆中移除「此日期」的固定事件嗎？(其他日期的固定事件將保留)", () => {
                if (!recurEvent.exceptions) recurEvent.exceptions = [];
                recurEvent.exceptions.push(date);
                saveData();
                renderCalendar(); 
                modalBackdrop.classList.add('hidden');
            });
        }
    } else {
        if (date && placedEvents[date]) {
            placedEvents[date] = placedEvents[date].filter(event => event.id !== id);
            if (placedEvents[date].length === 0) {
                delete placedEvents[date];
            }
            const eventInUserList = userEvents.find(ev => ev.id === id);
            if (eventInUserList) {
                eventInUserList.placedDates = eventInUserList.placedDates.filter(d => d !== date);
            }
            saveData();
            renderCalendar();
            renderEventList(); 
            modalBackdrop.classList.add('hidden');
        }
    }
});

// --- [修改] Modal 儲存按鈕邏輯 (檢查衝突) ---
modalSaveBtn.addEventListener('click', () => {
    const { date, id, type } = currentEditingEvent;
    
    const newName = modalEventName.value.trim();
    const newStart = modalEventStart.value;
    const newEnd = modalEventEnd.value;

    if (!newName) {
        showAlert("請輸入事件名稱！");
        return;
    }

    // 檢查結束時間是否早於開始時間
    if (newStart && newEnd && newStart >= newEnd) {
        showAlert("結束時間必須晚於開始時間！");
        return;
    }

    // --- 檢查時間衝突 ---
    // 注意：如果是固定事件，這裡只檢查「目前點擊的這個日期」是否有衝突
    // 如果想要檢查所有週次，邏輯會變得非常複雜，這裡採取 UX 最直覺的做法
    const hasConflict = checkTimeConflict(date, newStart, newEnd, id);

    if (hasConflict) {
        showConfirm("此時段與現有事件重疊，確定要新增嗎？", () => {
            // 使用者點擊確定後，執行儲存
            executeSave();
        });
    } else {
        // 無衝突，直接儲存
        executeSave();
    }
});

// --- [新增] 執行儲存的函式 (從 modalSaveBtn 抽離) ---
function executeSave() {
    const { date, id, mode, type } = currentEditingEvent;
    
    const newName = modalEventName.value.trim();
    const newStart = modalEventStart.value;
    const newEnd = modalEventEnd.value;
    const newDesc = modalEventDesc.value.trim();

    if (type === 'recurring') {
        const recurEvent = recurringEvents.find(ev => ev.id === id);
        if (recurEvent) {
            recurEvent.name = newName;
            recurEvent.startTime = newStart;
            recurEvent.endTime = newEnd;
            recurEvent.description = newDesc;
            saveData();
            renderRecurringEventList(); 
            renderCalendar();
            modalBackdrop.classList.add('hidden');
        }
        return;
    }

    if (mode === 'edit') {
        if (placedEvents[date]) {
            const eventToUpdate = placedEvents[date].find(event => event.id === id);
            if (eventToUpdate) {
                eventToUpdate.name = newName;
                eventToUpdate.startTime = newStart;
                eventToUpdate.endTime = newEnd;
                eventToUpdate.description = newDesc;
                const eventInUserList = userEvents.find(ev => ev.id === id);
                if(eventInUserList && eventInUserList.name !== newName) {
                    eventInUserList.name = newName;
                    renderEventList(); 
                }
            }
        }
    } else {
        const newEvent = {
            id: 'event-' + Date.now(),
            name: newName,
            startTime: newStart,
            endTime: newEnd,
            description: newDesc,
            placedDates: [date] 
        };
        if (!placedEvents[date]) {
            placedEvents[date] = [];
        }
        placedEvents[date].push(newEvent);
        
        let eventInUserList = userEvents.find(ev => ev.name.toLowerCase() === newName.toLowerCase());
        if (!eventInUserList) {
            const newUserEvent = { ...newEvent, id: 'event-' + Date.now() }; 
            userEvents.push(newUserEvent);
            newEvent.id = newUserEvent.id; 
            renderEventList();
        } else {
            eventInUserList.placedDates.push(date);
            newEvent.id = eventInUserList.id; 
            renderEventList();
        }
    }
    
    saveData();
    renderCalendar();
    modalBackdrop.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderEventList();
    renderRecurringEventList();
    renderCalendar();
    addRecurringBtn.addEventListener('click', addRecurringEvent);
});