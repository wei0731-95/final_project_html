// --- 1. Firebase 初始化與設定 ---
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

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // 初始化 Firestore 資料庫

// --- 全局變數 ---
let currentUser = null;       // 目前登入的使用者
let unsubscribeEvents = null; // 用來取消一般事件監聽
let unsubscribeRecur = null;  // 用來取消循環事件監聽

// 資料容器 (會隨雲端資料自動更新)
let userEvents = [];
let placedEvents = {}; 
let recurringEvents = [];

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let draggedEvent = null;
const dayNames = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

let currentEditingEvent = { date: null, id: null, mode: 'create', type: 'normal' };

// --- DOM 元素 ---
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


// Modal DOM
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

// Alert/Confirm DOM
const msgBackdrop = document.getElementById('message-modal-backdrop');
const msgTitle = document.getElementById('msg-title');
const msgBody = document.getElementById('msg-body');
const msgConfirmBtn = document.getElementById('msg-confirm-btn');
const msgCancelBtn = document.getElementById('msg-cancel-btn');


// --- 2. 登入/登出邏輯與即時監聽 ---

loginBtn.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch((error) => alert("登入失敗：" + error.message));
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        // --- 登入成功 ---
        currentUser = user;
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userNameDisplay.textContent = user.displayName;
        userPhotoDisplay.src = user.photoURL;
        
        console.log("已登入，開始同步資料...");
        startListeningToFirestore(user.uid); // 啟動監聽

    } else {
        // --- 登出 ---
        currentUser = null;
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        
        // 停止監聽並清空資料
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

// --- Firestore 核心：即時監聽資料 ---
function startListeningToFirestore(uid) {
    // 1. 監聽一般事件 (Events)
    const qEvents = query(collection(db, "events"), where("uid", "==", uid));
    
    unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
        userEvents = [];
        placedEvents = {};

        snapshot.forEach((doc) => {
            const data = doc.data();
            const eventObj = { ...data, id: doc.id }; // 使用 Firestore 的 ID
            
            userEvents.push(eventObj);

            // 解析放到日曆上的日期
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

    // 2. 監聽固定事件 (Recurring Events)
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


//資料庫操作 (取代原本的 localStorage)

// 新增一般事件
async function addEventToDB(name, category) { 
    if (!currentUser) return alert("請先登入！");
    try {
        await addDoc(collection(db, "events"), {
            uid: currentUser.uid,
            name: name,
            category: category || 'default', // ★ 這裡儲存傳進來的分類
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

// 新增循環事件
async function addRecurringEventToDB(name, dayOfWeek) {
    if (!currentUser) return alert("請先登入！");
    try {
        await addDoc(collection(db, "recurring_events"), {
            uid: currentUser.uid,
            name: name,
            dayOfWeek: dayOfWeek,
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

// 更新事件 (通用)
async function updateEventInDB(collectionName, eventId, updateData) {
    try {
        const eventRef = doc(db, collectionName, eventId);
        await updateDoc(eventRef, updateData);
    } catch (e) {
        console.error("Update failed: ", e);
    }
}

// 刪除事件
async function deleteEventFromDB(collectionName, eventId) {
    try {
        await deleteDoc(doc(db, collectionName, eventId));
    } catch (e) {
        console.error("Delete failed: ", e);
    }
}


// --- 4. 介面互動邏輯 (大部分邏輯與之前相同，但改呼叫 DB 函數) ---

// 輔助：時間轉換
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// 衝突檢查
function getConflictingEvent(date, newStartStr, newEndStr, ignoreId) {
    if (!newStartStr || !newEndStr) return null;
    const newStart = timeToMinutes(newStartStr);
    const newEnd = timeToMinutes(newEndStr);

    // 1. 檢查一般事件
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

    // 2. 檢查循環事件
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
    return null; // 都沒衝突
}

// 渲染列表
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

// 按鈕事件：新增
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
    if(val) {
        addRecurringEventToDB(val, parseInt(recurringDaySelect.value));
        recurringEventInput.value = '';
    }
});


// 渲染日曆
function renderCalendar() {
    calendarGrid.innerHTML = ''; 
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); 
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate(); 
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate(); 
    const today = new Date().toDateString();

    currentMonthYear.textContent = new Date(currentYear, currentMonth).toLocaleString('zh-TW', {
        year: 'numeric', month: 'long'
    });

    // 上個月填充
    for (let i = firstDayOfMonth; i > 0; i--) {
        const day = document.createElement('div');
        day.classList.add('calendar-day', 'empty-day');
        day.textContent = daysInPrevMonth - i + 1;
        calendarGrid.appendChild(day);
    }

    // 當月日期
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

        // 點擊格子
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

    // 下個月填充
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

        // 一般事件
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

        // 循環事件
        const dayDate = new Date(date + 'T00:00:00');
        const dayOfWeek = dayDate.getDay();
        recurringEvents.forEach(recur => {
            const isException = recur.exceptions && recur.exceptions.includes(date);
            if (recur.dayOfWeek === dayOfWeek && !isException) {
                const div = document.createElement('div');
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

// 拖曳相關
function addDragListenersToEvents() {
    document.querySelectorAll('.draggable-event').forEach(div => {
        div.addEventListener('dragstart', (e) => {
            const id = e.target.dataset.eventId;
            // 從 userEvents 找到原始資料
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
                
                // 計算新的 placedDates
                let newPlacedDates = [...(draggedEvent.placedDates || [])];
                
                // 如果是從某一天移過來的，先移除那一天
                if (sourceDate) {
                    newPlacedDates = newPlacedDates.filter(d => d !== sourceDate);
                }
                
                // 如果目標日期還沒在清單內，加入
                if (!newPlacedDates.includes(dropDate)) {
                    newPlacedDates.push(dropDate);
                }

                // 更新資料庫
                updateEventInDB("events", draggedEvent.id, { placedDates: newPlacedDates });
                draggedEvent = null;
            }
        });
    });
}


// Modal 編輯與儲存
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

// 儲存按鈕邏輯 (加入取代功能)
modalSaveBtn.addEventListener('click', () => {
    const { date, id, type, mode } = currentEditingEvent;
    const name = modalEventName.value.trim();
    const category = modalEventCategory.value;
    const start = modalEventStart.value;
    const end = modalEventEnd.value;
    const desc = modalEventDesc.value.trim();

    if (!name) return showAlert("請輸入名稱");
    if (start && end && start >= end) return showAlert("結束時間必須晚於開始時間");

    // 檢查是否有衝突
    const conflictEvent = getConflictingEvent(date, start, end, id);

    if (conflictEvent) {
        // 發現衝突，詢問是否取代
        let msg = `時間與「${conflictEvent.name}」衝突。\n確定要刪除舊行程並取代嗎？`;
        
        if (conflictEvent.conflictType === 'recurring') {
            msg = `時間與固定行程「${conflictEvent.name}」衝突。\n確定要取代這一次的行程嗎？`;
        }

        showConfirm(msg, async () => {
            
            // A. 先刪除擋路的舊事件
            if (conflictEvent.conflictType === 'normal') {
                // 如果是一般事件，直接從資料庫刪除
                await deleteEventFromDB("events", conflictEvent.id);
            } else {
                // 如果是循環事件，把今天加入「例外清單」(隱藏這一次)
                const newExc = [...(conflictEvent.exceptions || []), date];
                await updateEventInDB("recurring_events", conflictEvent.id, { exceptions: newExc });
            }

            doSave(); 
        });
    } else {
        // 沒有衝突，直接存
        doSave();
    }

    // 執行儲存的動作 (封裝起來)
    function doSave() {
        if (type === 'recurring') {
            updateEventInDB("recurring_events", id, {
                name, startTime: start, endTime: end, description: desc
            });
        } else {
            // Normal Event
            if (mode === 'edit') {
                updateEventInDB("events", id, {
                    name, 
                    category: category, // ★ 新增這行：更新分類
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
            // 找到原始物件以獲取目前的 exceptions
            const ev = recurringEvents.find(e => e.id === id);
            const newExc = [...(ev.exceptions || []), date];
            updateEventInDB("recurring_events", id, { exceptions: newExc });
            modalBackdrop.classList.add('hidden');
        });
    } else {
        // Normal Event: 從這天移除
        const ev = userEvents.find(e => e.id === id);
        const newDates = ev.placedDates.filter(d => d !== date);
        updateEventInDB("events", id, { placedDates: newDates });
        modalBackdrop.classList.add('hidden');
    }
});


// 每日清單 Modal 的顯示邏輯
function populateDailyList(dateString) {
    modalDailyList.innerHTML = '';
    
    // 收集當日所有事件
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

// 介面切換與初始化
showCreateFormBtn.addEventListener('click', () => {
    // 從「檢視模式」切換到「新增模式」
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

// Alert
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
        for(let m=0; m<60; m+=10) { //改動時間部分
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

// 深色模式切換邏輯 
const themeToggleBtn = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

// 讀取使用者之前的設定
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    htmlElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

themeToggleBtn.addEventListener('click', () => {
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    htmlElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme); // 記憶設定
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    // 切換按鈕的圖示
    themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}


