import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBG63b6S--e2oAykHIYNtwPe7SKAIVrOPE",
    authDomain: "html-project-8113c.firebaseapp.com",
    projectId: "html-project-8113c",
    storageBucket: "html-project-8113c.firebasestorage.app",
    messagingSenderId: "489478259740",
    appId: "1:489478259740:web:052c5759adb53cedae8bd9",
    measurementId: "G-S2VWXY0KHD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let unsubscribeEvents = null;
let unsubscribeRecur = null;

let userEvents = [];
let placedEvents = {}; 
let recurringEvents = [];

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let draggedEvent = null;
const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

let currentEditingEvent = { date: null, id: null, mode: 'create', type: 'normal' };

const recurringCategorySelect = document.getElementById('recurringCategorySelect');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userNameDisplay = document.getElementById('user-name');
const userPhotoDisplay = document.getElementById('user-photo');

const currentMonthYear = document.getElementById('currentMonthYear');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const calendarGrid = document.getElementById('calendarGrid');
const newEventInput = document.getElementById('newEventInput');
const quickCategorySelect = document.getElementById('quickCategorySelect');
const addEventBtn = document.getElementById('addEventBtn');
const eventList = document.getElementById('eventList');

const recurringEventInput = document.getElementById('recurringEventInput');
const recurringDaySelect = document.getElementById('recurringDaySelect');
const addRecurringBtn = document.getElementById('addRecurringBtn');
const recurringEventList = document.getElementById('recurringEventList');

const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalDailyList = document.getElementById('modal-daily-list');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalEventName = document.getElementById('modal-event-name');
const modalEventCategory = document.getElementById('modal-event-category'); 
const modalEventStart = document.getElementById('modal-event-start');
const modalEventEnd = document.getElementById('modal-event-end');
const modalEventDesc = document.getElementById('modal-event-desc');
const modalFormContent = document.querySelector('.modal-form-content');
const modalActions = document.querySelector('.modal-actions');
const modalCreateAction = document.querySelector('.modal-create-action');
const showCreateFormBtn = document.getElementById('show-create-form-btn');

const msgBackdrop = document.getElementById('message-modal-backdrop');
const msgTitle = document.getElementById('msg-title');
const msgBody = document.getElementById('msg-body');
const msgConfirmBtn = document.getElementById('msg-confirm-btn');
const msgCancelBtn = document.getElementById('msg-cancel-btn');

loginBtn.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch((error) => alert("登入失敗：" + error.message));
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userNameDisplay.textContent = user.displayName;
        userPhotoDisplay.src = user.photoURL;
        startListeningToFirestore(user.uid);
    } else {
        currentUser = null;
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        if (unsubscribeEvents) unsubscribeEvents();
        if (unsubscribeRecur) unsubscribeRecur();
        userEvents = [];
        placedEvents = {};
        recurringEvents = [];
        renderCalendar();
        renderEventList();
        renderRecurringEventList();
    }
});

function startListeningToFirestore(uid) {
    const qEvents = query(collection(db, "events"), where("uid", "==", uid));
    unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
        userEvents = [];
        placedEvents = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            const eventObj = { ...data, id: doc.id };
            userEvents.push(eventObj);
            if (data.placedDates && Array.isArray(data.placedDates)) {
                data.placedDates.forEach(date => {
                    if (!placedEvents[date]) placedEvents[date] = [];
                    placedEvents[date].push(eventObj);
                });
            }
        });
        renderEventList();
        renderCalendar();
    });

    const qRecur = query(collection(db, "recurring_events"), where("uid", "==", uid));
    unsubscribeRecur = onSnapshot(qRecur, (snapshot) => {
        recurringEvents = [];
        snapshot.forEach((doc) => {
            recurringEvents.push({ ...doc.data(), id: doc.id });
        });
        renderRecurringEventList();
        renderCalendar();
    });
}

async function addEventToDB(name, category) { 
    if (!currentUser) return alert("請先登入！");
    try {
        await addDoc(collection(db, "events"), {
            uid: currentUser.uid,
            name: name,
            category: category || 'default',
            startTime: "",
            endTime: "",
            description: "",
            placedDates: [],
            createdAt: new Date()
        });
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("新增失敗，請檢查網路");
    }
}

async function addRecurringEventToDB(name, dayOfWeek, category) {
    if (!currentUser) return alert("請先登入！");
    try {
        await addDoc(collection(db, "recurring_events"), {
            uid: currentUser.uid,
            name: name,
            dayOfWeek: dayOfWeek,
            category: category || 'default',
            startTime: "",
            endTime: "",
            description: "",
            exceptions: [],
            createdAt: new Date()
        });
    } catch (e) {
        console.error("Error adding recurring: ", e);
    }
}

async function updateEventInDB(collectionName, eventId, updateData) {
    try {
        const eventRef = doc(db, collectionName, eventId);
        await updateDoc(eventRef, updateData);
    } catch (e) {
        console.error("Update failed: ", e);
    }
}

async function deleteEventFromDB(collectionName, eventId) {
    try {
        await deleteDoc(doc(db, collectionName, eventId));
    } catch (e) {
        console.error("Delete failed: ", e);
    }
}

function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function getConflictingEvent(date, newStartStr, newEndStr, ignoreId) {
    if (!newStartStr || !newEndStr) return null;
    const newStart = timeToMinutes(newStartStr);
    const newEnd = timeToMinutes(newEndStr);

    if (placedEvents[date]) {
        for (const event of placedEvents[date]) {
            if (event.id === ignoreId) continue;
            if (!event.startTime || !event.endTime) continue;
            const s = timeToMinutes(event.startTime);
            const e = timeToMinutes(event.endTime);
            if (newStart < e && newEnd > s) {
                return { ...event, conflictType: 'normal' };
            }
        }
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    for (const recurEvent of recurringEvents) {
        if (recurEvent.id === ignoreId) continue;
        const isException = recurEvent.exceptions && recurEvent.exceptions.includes(date);
        if (recurEvent.dayOfWeek === dayOfWeek && !isException) {
            if (!recurEvent.startTime || !recurEvent.endTime) continue;
            const s = timeToMinutes(recurEvent.startTime);
            const e = timeToMinutes(recurEvent.endTime);
            if (newStart < e && newEnd > s) {
                return { ...recurEvent, conflictType: 'recurring' };
            }
        }
    }
    return null;
}

function renderEventList() {
    eventList.innerHTML = ''; 
    userEvents.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.classList.add('draggable-event');
        eventDiv.classList.add(`cat-${event.category || 'default'}`);
        eventDiv.setAttribute('draggable', 'true');
        eventDiv.dataset.eventName = event.name; 
        eventDiv.dataset.eventId = event.id;
        
        const eventNameSpan = document.createElement('span');
        let displayText = event.name;
        if (event.placedDates && event.placedDates.length > 0) {
            displayText += ` (${event.placedDates.length})`;
        }
        eventNameSpan.textContent = displayText;
        eventDiv.appendChild(eventNameSpan);

        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = '✕';
        deleteBtn.classList.add('delete-event-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            showConfirm(`確定要刪除「${event.name}」嗎？`, () => {
                deleteEventFromDB("events", event.id);
            });
        });
        eventDiv.appendChild(deleteBtn);
        eventList.appendChild(eventDiv);
    });
    addDragListenersToEvents();
}

function renderRecurringEventList() {
    recurringEventList.innerHTML = '';
    recurringEvents.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.classList.add('recurring-event-item');
        
        const eventName = document.createElement('span');
        eventName.textContent = `${event.name} (${dayNames[event.dayOfWeek]})`;
        eventDiv.appendChild(eventName);

        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = '✕';
        deleteBtn.classList.add('delete-event-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showConfirm(`刪除「${event.name}」所有每週場次？`, () => {
                deleteEventFromDB("recurring_events", event.id);
            });
        });
        eventDiv.appendChild(deleteBtn);
        recurringEventList.appendChild(eventDiv);
    });
}

addEventBtn.addEventListener('click', () => {
    const val = newEventInput.value.trim();
    const cat = quickCategorySelect.value;
    if(val) {
        addEventToDB(val, cat);
        newEventInput.value = '';
    }
});
newEventInput.addEventListener('keypress', (e) => { if(e.key==='Enter') addEventBtn.click(); });

addRecurringBtn.addEventListener('click', () => {
    const val = recurringEventInput.value.trim();
    const cat = recurringCategorySelect.value;
    if(val) {
        addRecurringEventToDB(val, parseInt(recurringDaySelect.value), cat);
        recurringEventInput.value = '';
    }
});

function renderCalendar() {
    calendarGrid.innerHTML = ''; 
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); 
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate(); 
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate(); 
    const today = new Date().toDateString();

    currentMonthYear.textContent = new Date(currentYear, currentMonth).toLocaleString('zh-TW', {
        year: 'numeric', month: 'long'
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
        if (new Date(currentYear, currentMonth, i).toDateString() === today) day.classList.add('current-day');
        day.appendChild(dayNumber);

        day.addEventListener('click', (e) => {
            if (e.target.classList.contains('calendar-day') || e.target.classList.contains('day-number')) {
                currentEditingEvent = { date: dateString, id: null, mode: 'view' }; 
                modalTitle.textContent = `${dateString} 的行程`;
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

    const total = firstDayOfMonth + daysInMonth;
    for (let i = 1; i <= (42 - total); i++) {
        const day = document.createElement('div');
        day.classList.add('calendar-day', 'empty-day');
        day.textContent = i;
        calendarGrid.appendChild(day);
    }
    
    renderPlacedEvents();
    addDragListenersToCalendarDays();
}

function renderPlacedEvents() {
    document.querySelectorAll('.calendar-day').forEach(dayElement => {
        const date = dayElement.dataset.date;
        if(!date) return;
        
        dayElement.querySelectorAll('.placed-event, .placed-recurring-event').forEach(e=>e.remove());

        if (placedEvents[date]) {
            placedEvents[date].forEach(eventData => {
                const div = document.createElement('div');
                div.classList.add('placed-event');
                div.classList.add(`cat-${eventData.category || 'default'}`);
                div.textContent = eventData.name; 
                div.setAttribute('draggable', 'true');
                div.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    draggedEvent = { ...eventData, sourceDate: date, type: 'normal' };
                    div.classList.add('dragging');
                });
                div.addEventListener('dragend', () => div.classList.remove('dragging'));
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditModal(eventData, date, 'normal');
                });
                dayElement.appendChild(div);
            });
        }

        const dayDate = new Date(date + 'T00:00:00');
        const dayOfWeek = dayDate.getDay();
        recurringEvents.forEach(recur => {
            const isException = recur.exceptions && recur.exceptions.includes(date);
            if (recur.dayOfWeek === dayOfWeek && !isException) {
                const div = document.createElement('div');
                div.classList.add(`cat-${recur.category || 'default'}`);
                div.classList.add('placed-recurring-event');
                div.textContent = recur.name;
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditModal(recur, date, 'recurring');
                });
                dayElement.appendChild(div);
            }
        });
    });
}

function addDragListenersToEvents() {
    document.querySelectorAll('.draggable-event').forEach(div => {
        div.addEventListener('dragstart', (e) => {
            const id = e.target.dataset.eventId;
            const original = userEvents.find(ev => ev.id === id);
            if(original) {
                draggedEvent = { ...original, type: 'normal' }; 
                e.target.classList.add('dragging');
            }
        });
        div.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
            draggedEvent = null;
        });
    });
}

function addDragListenersToCalendarDays() {
    document.querySelectorAll('.calendar-day:not(.empty-day)').forEach(day => {
        day.addEventListener('dragover', (e) => {
            e.preventDefault();
            day.classList.add('drag-over');
        });
        day.addEventListener('dragleave', () => day.classList.remove('drag-over'));
        day.addEventListener('drop', (e) => {
            e.preventDefault();
            day.classList.remove('drag-over');
            
            if (draggedEvent && draggedEvent.type === 'normal') {
                const dropDate = day.dataset.date;
                const sourceDate = draggedEvent.sourceDate;
                
                let newPlacedDates = [...(draggedEvent.placedDates || [])];
                
                if (sourceDate) {
                    newPlacedDates = newPlacedDates.filter(d => d !== sourceDate);
                }
                
                if (!newPlacedDates.includes(dropDate)) {
                    newPlacedDates.push(dropDate);
                }

                updateEventInDB("events", draggedEvent.id, { placedDates: newPlacedDates });
                draggedEvent = null;
            }
        });
    });
}

function openEditModal(eventData, date, type) {
    currentEditingEvent = { date, id: eventData.id, mode: 'edit', type };
    modalTitle.textContent = type === 'recurring' ? '編輯固定事件' : '編輯事件';
    
    modalDailyList.style.display = 'none';
    modalCreateAction.style.display = 'none';
    modalFormContent.style.display = 'block';
    modalActions.style.display = 'flex';
    modalDeleteBtn.style.display = 'inline-block';
    modalSaveBtn.style.display = 'inline-block';
    
    modalEventName.value = eventData.name;
    if(modalEventCategory) {
        modalEventCategory.value = eventData.category || 'default';
    }
    modalEventStart.value = eventData.startTime || '';
    modalEventEnd.value = eventData.endTime || '';
    modalEventDesc.value = eventData.description || '';
    
    modalBackdrop.classList.remove('hidden');
}

modalSaveBtn.addEventListener('click', () => {
    const { date, id, type, mode } = currentEditingEvent;
    const name = modalEventName.value.trim();
    const category = modalEventCategory.value;
    const start = modalEventStart.value;
    const end = modalEventEnd.value;
    const desc = modalEventDesc.value.trim();

    if (!name) return showAlert("請輸入名稱");
    if (start && end && start >= end) return showAlert("結束時間必須晚於開始時間");

    const conflictEvent = getConflictingEvent(date, start, end, id);

    if (conflictEvent) {
        let msg = `時間與「${conflictEvent.name}」衝突。\n確定要刪除舊行程並取代嗎？`;
        if (conflictEvent.conflictType === 'recurring') {
            msg = `時間與固定行程「${conflictEvent.name}」衝突。\n確定要取代這一次的行程嗎？`;
        }

        showConfirm(msg, async () => {
            if (conflictEvent.conflictType === 'normal') {
                await deleteEventFromDB("events", conflictEvent.id);
            } else {
                const newExc = [...(conflictEvent.exceptions || []), date];
                await updateEventInDB("recurring_events", conflictEvent.id, { exceptions: newExc });
            }
            doSave(); 
        });
    } else {
        doSave();
    }

    function doSave() {
        if (type === 'recurring') {
            updateEventInDB("recurring_events", id, {
                name, startTime: start, endTime: end, description: desc
            });
        } else {
            if (mode === 'edit') {
                updateEventInDB("events", id, {
                    name, 
                    category: category,
                    startTime: start, 
                    endTime: end, 
                    description: desc
                });
            } else {
                addDoc(collection(db, "events"), {
                    uid: currentUser.uid,
                    name: name,
                    category: category,
                    startTime: start,
                    endTime: end,
                    description: desc,
                    placedDates: [date],
                    createdAt: new Date()
                });
            }
        }
        modalBackdrop.classList.add('hidden');
    }
});

modalDeleteBtn.addEventListener('click', () => {
    const { date, id, type } = currentEditingEvent;
    
    if (type === 'recurring') {
        showConfirm("要隱藏這天的固定事件嗎？", () => {
            const ev = recurringEvents.find(e => e.id === id);
            const newExc = [...(ev.exceptions || []), date];
            updateEventInDB("recurring_events", id, { exceptions: newExc });
            modalBackdrop.classList.add('hidden');
        });
    } else {
        const ev = userEvents.find(e => e.id === id);
        const newDates = ev.placedDates.filter(d => d !== date);
        updateEventInDB("events", id, { placedDates: newDates });
        modalBackdrop.classList.add('hidden');
    }
});

function populateDailyList(dateString) {
    modalDailyList.innerHTML = '';
    
    let list = [];
    if (placedEvents[dateString]) {
        list = list.concat(placedEvents[dateString].map(e => ({...e, type: 'normal'})));
    }
    const dayDate = new Date(dateString + 'T00:00:00');
    const dayOfWeek = dayDate.getDay();
    recurringEvents.forEach(r => {
        const isEx = r.exceptions && r.exceptions.includes(dateString);
        if (r.dayOfWeek === dayOfWeek && !isEx) {
            list.push({ ...r, type: 'recurring' });
        }
    });

    list.sort((a,b) => {
        const sa = a.startTime, sb = b.startTime;
        if(sa && !sb) return -1;
        if(!sa && sb) return 1;
        if(sa && sb) return sa.localeCompare(sb);
        return 0;
    });

    if (list.length === 0) {
        modalDailyList.innerHTML = '<p style="text-align:center; color:#999;">無行程</p>';
    } else {
        list.forEach(ev => {
            const div = document.createElement('div');
            div.className = 'daily-list-item' + (ev.type==='recurring'?' recurring':'');
            div.innerHTML = `<h4>${ev.name} ${ev.type==='recurring'?'<small>(每週)</small>':''}</h4>
                             <p>${ev.startTime ? '🕒 '+ev.startTime+' - '+ev.endTime : '🕒 全天'}</p>`;
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(ev, dateString, ev.type);
            });
            modalDailyList.appendChild(div);
        });
    }
}

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

modalCloseBtn.addEventListener('click', () => modalBackdrop.classList.add('hidden'));
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) modalBackdrop.classList.add('hidden');});

function showAlert(msg) {
    msgTitle.textContent = "提示"; msgBody.textContent = msg; 
    msgCancelBtn.style.display = 'none'; 
    msgBackdrop.classList.remove('hidden');
    msgConfirmBtn.onclick = () => msgBackdrop.classList.add('hidden');
}
function showConfirm(msg, cb) {
    msgTitle.textContent = "確認"; msgBody.textContent = msg; 
    msgCancelBtn.style.display = 'inline-block';
    msgBackdrop.classList.remove('hidden');
    msgConfirmBtn.onclick = () => { msgBackdrop.classList.add('hidden'); cb(); };
    msgCancelBtn.onclick = () => msgBackdrop.classList.add('hidden');
}
msgBackdrop.addEventListener('click', (e) => { if(e.target===msgBackdrop) msgBackdrop.classList.add('hidden'); });

prevMonthBtn.addEventListener('click', () => {
    currentMonth--; if(currentMonth<0){currentMonth=11;currentYear--;} renderCalendar();
});
nextMonthBtn.addEventListener('click', () => {
    currentMonth++; if(currentMonth>11){currentMonth=0;currentYear++;} renderCalendar();
});

document.addEventListener('DOMContentLoaded', () => {
    const timeSelects = document.querySelectorAll('.time-select');
    
    const timeOptions = [];
    for(let h=0; h<24; h++) {
        for(let m=0; m<60; m+=10) { 
            const hour = h.toString().padStart(2, '0');
            const min = m.toString().padStart(2, '0');
            timeOptions.push(`${hour}:${min}`);
        }
    }

    timeSelects.forEach(select => {
        timeOptions.forEach(time => {
            const option = document.createElement('option');
            option.value = time;
            option.textContent = time;
            select.appendChild(option);
        });
    });

    document.getElementById('modal-event-start').value = "09:00";
    document.getElementById('modal-event-end').value = "10:00";

    renderCalendar();
});

const themeToggleBtn = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    htmlElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

themeToggleBtn.addEventListener('click', () => {
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    htmlElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

const showStatsBtn = document.getElementById('showStatsBtn');
const statsBackdrop = document.getElementById('stats-modal-backdrop');
const statsCloseBtn = document.getElementById('stats-close-btn');
let myChart = null; 

showStatsBtn.addEventListener('click', () => {
    calculateAndRenderStats();
    statsBackdrop.classList.remove('hidden');
});

statsCloseBtn.addEventListener('click', () => {
    statsBackdrop.classList.add('hidden');
});

statsBackdrop.addEventListener('click', (e) => {
    if (e.target === statsBackdrop) statsBackdrop.classList.add('hidden');
});

function calculateAndRenderStats() {
    const stats = {
        'work': 0,
        'personal': 0,
        'learning': 0,
        'important': 0,
        'default': 0
    };

    const colors = {
        'work': '#5e60ce',
        'personal': '#00b894',
        'learning': '#fdcb6e',
        'important': '#ff7675',
        'default': '#8bb2f1'
    };

    const labels = {
        'work': '工作',
        'personal': '個人',
        'learning': '學習',
        'important': '重要',
        'default': '一般'
    };

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const chartTextColor = isDarkMode ? '#ffffff' : '#333333'; 
    const chartBorderColor = isDarkMode ? '#2d2d44' : '#ffffff';

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    function getDuration(start, end) {
        if (!start || !end) return 0;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        return Math.max(0, endMin - startMin);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (placedEvents[dateStr]) {
            placedEvents[dateStr].forEach(ev => {
                const duration = getDuration(ev.startTime, ev.endTime);
                const cat = ev.category || 'default';
                if (stats[cat] !== undefined) stats[cat] += duration;
            });
        }
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(dateStr).getDay();

        recurringEvents.forEach(recur => {
            const isException = recur.exceptions && recur.exceptions.includes(dateStr);
            if (recur.dayOfWeek === dayOfWeek && !isException) {
                const duration = getDuration(recur.startTime, recur.endTime);
                const cat = recur.category || 'default';
                if (stats[cat] !== undefined) stats[cat] += duration;
            }
        });
    }

    const dataValues = [];
    const bgColors = [];
    const labelTexts = [];
    let totalMinutes = 0;

    for (const [key, minutes] of Object.entries(stats)) {
        if (minutes > 0) {
            dataValues.push((minutes / 60).toFixed(1));
            bgColors.push(colors[key]);
            labelTexts.push(labels[key]);
            totalMinutes += minutes;
        }
    }

    const totalHours = (totalMinutes / 60).toFixed(1);
    const totalDisplay = document.getElementById('total-hours-display');
    if(totalDisplay) {
        totalDisplay.style.color = 'var(--text-color)'; 
        totalDisplay.innerHTML = `本月總計：<span style="color:${isDarkMode ? '#a29bfe' : '#6c5ce7'}; font-size:1.2em;">${totalHours}</span> 小時`;
    }

    const ctx = document.getElementById('statsChart').getContext('2d');
    
    if (myChart) {
        myChart.destroy();
    }

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labelTexts,
            datasets: [{
                data: dataValues,
                backgroundColor: bgColors,
                borderWidth: 2,
                borderColor: chartBorderColor 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: chartTextColor, 
                        font: {
                            family: "'Noto Sans TC', sans-serif",
                            size: 14
                        },
                        padding: 20
                    }
                },
                tooltip: {
                    bodyColor: '#fff',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.raw} 小時`;
                        }
                    }
                }
            }
        }
    });
}
