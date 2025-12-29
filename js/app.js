// ==================== TIMETABLE APPLICATION ====================
const TimetableApp = (function() {
  // Private state
  let state = {
    currentSchedule: [],
    currentDayIndex: 0,
    currentBatch: 'A1',
    currentView: 'swipe',
    isDragging: false,
    startX: 0,
    startY: 0,
    currentTranslate: 0,
    prevTranslate: 0,
    totalDays: 6, // Mon-Sat
    dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    activeHighlightInterval: null,
    isVerticalScroll: false,
    isVerticalScrollPossible: false,
    initialScrollTop: 0
  };

  // DOM Elements cache
  const dom = {
    daysTrack: null,
    timetableContainer: null,
    compactContainer: null,
    tableBody: null,
    batchGrid: null,
    selectedBatchLabel: null,
    floatingBatch: null,
    filterArrow: null,
    filterPanel: null,
    dropdownArrow: null,
    dropdownContent: null,
    batchDropdownTrigger: null
  };

  // ==================== INITIALIZATION ====================
  function init() {
    console.log('Initializing Timetable App...');
    cacheDOMElements();
    loadSavedPreferences();
    setupEventListeners();
    initializeBatchDropdown();
    
    // RENDER
    renderInitialViews();
    
    // START SERVICES
    startActiveHighlighting();
    setupServiceWorker();
    
    // FIX LAYOUT & HIGHLIGHT AFTER LOAD
    setTimeout(() => {
        handleResize(); // Fixes "half-view" alignment
        jumpToDay(state.currentDayIndex);
        highlightActiveClass();
    }, 200);
  }

  function cacheDOMElements() {
    dom.daysTrack = document.getElementById('daysTrack');
    dom.timetableContainer = document.getElementById('timetable-container');
    dom.compactContainer = document.getElementById('compact-container');
    dom.tableBody = document.querySelector('.weekly-table tbody');
    dom.batchGrid = document.getElementById('batchGrid');
    dom.selectedBatchLabel = document.getElementById('selected-batch-label');
    dom.floatingBatch = document.getElementById('floating-batch');
    dom.filterArrow = document.getElementById('filter-arrow');
    dom.filterPanel = document.getElementById('filter-panel');
    dom.dropdownArrow = document.getElementById('dropdown-arrow');
    dom.dropdownContent = document.getElementById('batch-dropdown-content');
    dom.batchDropdownTrigger = document.getElementById('batch-dropdown-trigger');
  }

  function loadSavedPreferences() {
    // 1. Load Batch
    const savedBatch = Storage.get('selectedBatch', 'A1');
    state.currentBatch = savedBatch;
    
    // Load schedule from global variable in data.js
    if (typeof scheduleMap !== 'undefined' && scheduleMap[savedBatch]) {
        state.currentSchedule = scheduleMap[savedBatch];
    } else {
        // Safe fallback if data.js isn't ready yet
        state.currentSchedule = (typeof scheduleA1 !== 'undefined') ? scheduleA1 : [];
    }
    
    // 2. Load View Mode
    const savedView = Storage.get('preferredView', 'swipe');
    state.currentView = savedView;
    
    // 3. Load Theme
    const savedTheme = Storage.get('theme', 'dark');
    document.body.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('theme-btn');
    if(themeBtn) themeBtn.textContent = savedTheme === 'dark' ? '☀' : '🌙';
    
    // 4. Set Day to Today
    const today = DateTime.getCurrentDay();
    state.currentDayIndex = (today >= 1 && today <= 6) ? today - 1 : 0;
  }

  function setupEventListeners() {
    if (dom.daysTrack) {
      dom.daysTrack.addEventListener('touchstart', handleTouchStart, { passive: false });
      dom.daysTrack.addEventListener('touchmove', handleTouchMove, { passive: false });
      dom.daysTrack.addEventListener('touchend', handleTouchEnd);
      
      dom.daysTrack.addEventListener('mousedown', handleMouseStart);
      dom.daysTrack.addEventListener('mousemove', handleMouseMove);
      dom.daysTrack.addEventListener('mouseup', handleMouseEnd);
      dom.daysTrack.addEventListener('mouseleave', handleMouseLeave);
    }
    
    window.addEventListener('resize', debounce(handleResize, 200));
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyboardNavigation);
  }

  function setupServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(err => console.log("SW Fail", err));
    }
  }

  // ==================== RENDERING ====================
  function renderInitialViews() {
    updateBatchLabels(state.currentBatch);
    updateBatchUI();
    setViewMode(state.currentView); 
    renderMobileView();
    renderDesktopView();
  }

  function updateBatchLabels(batchName) {
      if (dom.selectedBatchLabel) dom.selectedBatchLabel.textContent = `Batch ${batchName}`;
      if (dom.floatingBatch) dom.floatingBatch.textContent = `BATCH ${batchName}`;
  }

  function renderMobileView() {
    if (!dom.daysTrack) return;
    dom.daysTrack.innerHTML = '';
    
    for (let day = 1; day <= 6; day++) {
      const dayView = createDayView(day);
      dom.daysTrack.appendChild(dayView);
    }
  }

  function createDayView(day) {
    const dayView = document.createElement('div');
    dayView.className = 'day-view';
    dayView.setAttribute('data-day-index', day);
    dayView.id = `day-${day}`;

    const header = document.createElement('h2');
    header.className = 'day-header';
    header.textContent = state.dayNames[day];
    dayView.appendChild(header);

    const dayClasses = state.currentSchedule
      .filter(s => s.day === day)
      .sort((a, b) => a.start - b.start);

    if (dayClasses.length === 0) {
      dayView.appendChild(createNoClassesCard());
    } else {
      renderDayClasses(dayView, dayClasses);
    }
    return dayView;
  }

  function renderDayClasses(container, classes) {
    let lastEndTime = classes[0].start;
    classes.forEach((cls, index) => {
      // Logic for gaps/breaks
      if (index > 0 && cls.start > lastEndTime) {
        const gapStart = lastEndTime;
        const gapEnd = cls.start;
        
        if (gapStart <= 12 && gapEnd >= 13) {
          if (12 > gapStart) container.appendChild(createBreakCard(gapStart, 12, "Break"));
          container.appendChild(createBreakCard(12, 13, "Lunch Break"));
          if (gapEnd > 13) container.appendChild(createBreakCard(13, gapEnd, "Break"));
        } else {
          container.appendChild(createBreakCard(gapStart, gapEnd, "Break"));
        }
      }
      container.appendChild(createClassCard(cls));
      lastEndTime = cls.start + cls.duration;
    });
  }

  function createNoClassesCard() {
    const card = document.createElement('div');
    card.className = 'break-card';
    card.innerHTML = `<div class="break-header">No Classes Today! 🥳</div>`;
    return card;
  }

  function createClassCard(cls) {
    const displayTeacher = getTeacherDisplayName(cls.teacher);
    const displayTitle = getSubjectFullTitle(cls.title, cls.type) || cls.title;
    
    const card = document.createElement('div');
    card.className = `class-card type-${cls.type}`;
    
    // Attributes used by Highlighter
    card.dataset.startHour = cls.start.toString();
    card.dataset.day = cls.day.toString();
    
    card.innerHTML = `
      <div class="time-slot">${formatTimeRange(cls.start, cls.duration)}</div>
      <div class="subject-name">${displayTitle}</div>
      <div class="card-footer">
        <span class="info-badge">🏛 ${cls.code}</span>
        <span class="info-badge">👨‍🏫 ${displayTeacher}</span>
        <span class="info-badge">${cls.type.toUpperCase()}</span>
      </div>
    `;
    return card;
  }

  function createBreakCard(start, end, title) {
    const breakCard = document.createElement('div');
    breakCard.className = 'break-card';
    breakCard.innerHTML = `
      <div class="break-header">${title}</div>
      <div class="break-time-text">${formatTimeRange(start, end - start)}</div>
    `;
    return breakCard;
  }

  // --- DESKTOP VIEW ---
  function renderDesktopView() {
    if (!dom.tableBody) return;
    dom.tableBody.innerHTML = '';
    const hours = [9, 10, 11, 12, 13, 14, 15, 16];
    const occupiedCells = new Set();

    hours.forEach(hour => {
      const row = document.createElement('tr');
      row.setAttribute('data-hour', hour); 

      const timeCell = document.createElement('td');
      const displayHour = hour % 12 || 12;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      timeCell.textContent = `${displayHour < 10 ? '0'+displayHour : displayHour}:00 ${ampm}`;
      row.appendChild(timeCell);

      for (let day = 1; day <= 6; day++) {
        const cellKey = `${hour}-${day}`;
        if (occupiedCells.has(cellKey)) continue;
        
        const cls = state.currentSchedule.find(s => s.day === day && s.start === hour);
        
        if (cls) {
          const cell = createTableCell(cls);
          if (cls.duration > 1) {
            for (let i = 1; i < cls.duration; i++) occupiedCells.add(`${hour + i}-${day}`);
          }
          row.appendChild(cell);
        } else {
          // Fix for empty cells
          const cell = createEmptyTableCell(day, hour);
          row.appendChild(cell);
        }
      }
      dom.tableBody.appendChild(row);
    });
  }

  function createTableCell(cls) {
    const cell = document.createElement('td');
    cell.className = `cell-${cls.type}`;
    if (cls.duration > 1) cell.rowSpan = cls.duration;
    const displayTitle = getSubjectFullTitle(cls.title, cls.type) || cls.title;
    cell.innerHTML = `<span class="cell-subject" title="${displayTitle}">${displayTitle}</span><span class="cell-room">${cls.code}</span>`;
    return cell;
  }

  function createEmptyTableCell(day, hour) {
    const cell = document.createElement('td');
    if (hour === 12) {
      cell.className = 'cell-break';
      cell.innerHTML = '<span style="font-size:0.6rem; opacity:0.5;">LUNCH</span>';
    }
    return cell;
  }

  // ==================== BATCH MANAGEMENT ====================
  function initializeBatchDropdown() {
    if (!dom.batchGrid) return;
    const batches = (typeof scheduleMap !== 'undefined') ? Object.keys(scheduleMap) : ['A1', 'A6'];
    dom.batchGrid.innerHTML = '';
    batches.forEach(batch => {
      const button = document.createElement('button');
      button.className = 'batch-btn';
      button.textContent = batch;
      button.onclick = () => selectBatch(batch);
      dom.batchGrid.appendChild(button);
    });
    updateBatchUI();
  }

  function selectBatch(batchName) {
    state.currentBatch = batchName;
    if (typeof scheduleMap !== 'undefined' && scheduleMap[batchName]) {
        state.currentSchedule = scheduleMap[batchName];
    }
    
    // Save Persistence
    Storage.set('selectedBatch', batchName);
    
    // Visual Updates
    updateBatchLabels(batchName);
    toggleBatchDropdown(false);
    updateBatchUI();
    renderMobileView();
    renderDesktopView();
    
    setTimeout(() => {
        highlightActiveClass();
        jumpToDay(state.currentDayIndex);
    }, 50);
  }

  function updateBatchUI() {
    document.querySelectorAll('.batch-btn').forEach(btn => {
      btn.classList.toggle('active-batch', btn.textContent === state.currentBatch);
    });
  }

  // ==================== VIEW MODE ====================
  function setViewMode(mode) {
    state.currentView = mode;
    Storage.set('preferredView', mode);
    
    document.querySelectorAll('#btn-swipe, #btn-table').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${mode}`);
    if(activeBtn) activeBtn.classList.add('active');
    
    if (mode === 'swipe') {
      dom.timetableContainer.classList.remove('hidden-view');
      dom.compactContainer.classList.add('hidden-view');
      // Recalculate layout on view switch
      setTimeout(() => {
          handleResize();
          jumpToDay(state.currentDayIndex);
      }, 50);
    } else {
      dom.timetableContainer.classList.add('hidden-view');
      dom.compactContainer.classList.remove('hidden-view');
    }
  }

  // ==================== NAVIGATION (FIXED LOOP & WIDTH) ====================
  function jumpToDay(index) {
    if (index < 0 || index >= state.totalDays) return;
    state.currentDayIndex = index;
    
    // FIX: Use offsetWidth instead of window.innerWidth to handle scrollbars/notches
    const trackWidth = dom.timetableContainer ? dom.timetableContainer.offsetWidth : window.innerWidth;
    state.currentTranslate = index * -trackWidth;
    state.prevTranslate = state.currentTranslate;
    
    if (dom.daysTrack) {
      dom.daysTrack.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.5, 1)';
      dom.daysTrack.style.transform = `translateX(${state.currentTranslate}px)`;
    }
    
    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.classList.toggle('active-day', parseInt(btn.dataset.day) === index + 1);
    });
  }

  function manualJumpToDay(dayNumber) {
    jumpToDay(dayNumber - 1);
  }

  // ==================== HIGHLIGHTING ====================
  function highlightActiveClass() {
    document.querySelectorAll('.active-now').forEach(el => el.classList.remove('active-now'));
    
    const currentDay = DateTime.getCurrentDay();
    const currentHour = DateTime.getCurrentHour();
    
    if (currentDay >= 1 && currentDay <= 6) {
      const activeClass = state.currentSchedule.find(cls => 
        cls.day === currentDay && 
        currentHour >= cls.start && 
        currentHour < (cls.start + cls.duration)
      );

      if (activeClass) {
        // Highlight Mobile
        const dayView = document.querySelector(`#day-${currentDay}`);
        if (dayView) {
          const card = dayView.querySelector(`.class-card[data-start-hour="${activeClass.start}"]`);
          if (card) {
              card.classList.add('active-now');
   const dayView = card.closest('.day-view');
if (dayView) {
  dayView.scrollTo({
    top: card.offsetTop - dayView.clientHeight / 2 + card.clientHeight / 2,
    behavior: 'smooth'
  });
}
          }
        }
        // Highlight Table
        const row = document.querySelector(`.weekly-table tr[data-hour="${activeClass.start}"]`);
        if (row) {
          const cell = row.querySelector(`td:nth-child(${currentDay + 1})`);
          if (cell && !cell.classList.contains('cell-break')) {
              cell.classList.add('active-now');
          }
        }
      }
    }
  }

  function startActiveHighlighting() {
    highlightActiveClass();
    state.activeHighlightInterval = setInterval(highlightActiveClass, 60000);
  }

  // ==================== SWIPE LOGIC (FIXED LOOP) ====================
  function handleTouchStart(e) {
    if (state.currentView !== 'swipe') return;
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
    
    const dayView = document.querySelector(`#day-${state.currentDayIndex + 1}`);
    if (dayView) {
      state.initialScrollTop = dayView.scrollTop;
      state.isVerticalScrollPossible = dayView.scrollHeight > dayView.clientHeight;
      state.isVerticalScroll = false;
    }
  }

  function handleTouchMove(e) {
    if (!state.isDragging || state.currentView !== 'swipe') return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - state.startX);
    const deltaY = Math.abs(touch.clientY - state.startY);
    
    if (state.isVerticalScrollPossible && deltaY > deltaX) {
        state.isVerticalScroll = true;
        state.isDragging = false; 
        if (dom.timetableContainer) dom.timetableContainer.style.cursor = 'default';
        return;
    }

    if (deltaX > 5) {
        e.preventDefault();
        moveDrag(touch.clientX);
    }
  }

  function handleTouchEnd() {
    if (!state.isVerticalScroll) endDrag();
    else {
        state.isDragging = false;
        state.isVerticalScroll = false;
        if(dom.timetableContainer) dom.timetableContainer.style.cursor = 'grab';
    }
  }

  function handleMouseStart(e) { 
      if (state.currentView !== 'swipe') return;
      e.preventDefault(); 
      startDrag(e.clientX, e.clientY); 
  }
  function handleMouseMove(e) { if(state.isDragging) { e.preventDefault(); moveDrag(e.clientX); } }
  function handleMouseEnd() { endDrag(); }
  function handleMouseLeave() { if(state.isDragging) endDrag(); }

  function startDrag(x, y) {
    state.isDragging = true;
    state.startX = x;
    state.startY = y;
    if(dom.daysTrack) dom.daysTrack.style.transition = 'none';
  }

  function moveDrag(x) {
    state.currentTranslate = state.prevTranslate + (x - state.startX);
    if(dom.daysTrack) dom.daysTrack.style.transform = `translateX(${state.currentTranslate}px)`;
  }

  function endDrag() {
    if(!state.isDragging) return;
    state.isDragging = false;
    
    const movedBy = state.currentTranslate - state.prevTranslate;
    const containerWidth = dom.timetableContainer ? dom.timetableContainer.offsetWidth : window.innerWidth;
    const threshold = containerWidth / 4;
    
    // FIX: ADDED LOOP LOGIC HERE
    if (movedBy < -threshold) {
      // Next Day (Loop to Mon if at Sat)
      state.currentDayIndex = (state.currentDayIndex < state.totalDays - 1) ? state.currentDayIndex + 1 : 0;
    } else if (movedBy > threshold) {
      // Prev Day (Loop to Sat if at Mon)
      state.currentDayIndex = (state.currentDayIndex > 0) ? state.currentDayIndex - 1 : state.totalDays - 1;
    }
    
    jumpToDay(state.currentDayIndex);
  }

  // ==================== UI CONTROLS ====================
  function toggleFilterPanel() {
    const isExpanded = dom.filterPanel.classList.toggle('expanded');
    dom.filterArrow.textContent = isExpanded ? '🔼' : '🔽';
    if (!isExpanded) toggleBatchDropdown(false);
  }

  function toggleBatchDropdown(force) {
    if (force === false) {
        dom.dropdownContent.classList.remove('show');
        dom.dropdownArrow.textContent = '▼';
    } else {
        dom.dropdownContent.classList.toggle('show');
        dom.dropdownArrow.textContent = dom.dropdownContent.classList.contains('show') ? '▲' : '▼';
    }
  }

  function handleOutsideClick(e) {
    if (dom.dropdownContent && dom.dropdownContent.classList.contains('show')) {
      if (!dom.batchDropdownTrigger.contains(e.target) && !dom.dropdownContent.contains(e.target)) {
        toggleBatchDropdown(false);
      }
    }
  }

  function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    Storage.set('theme', newTheme);
    const btn = document.getElementById('theme-btn');
    if(btn) btn.textContent = newTheme === 'dark' ? '☀' : '🌙';
  }

  function handleResize() {
    jumpToDay(state.currentDayIndex);
  }

  function handleKeyboardNavigation(e) {
    if (state.currentView !== 'swipe') return;
    if (e.key === 'ArrowRight') jumpToDay(state.currentDayIndex < 5 ? state.currentDayIndex + 1 : 0);
    if (e.key === 'ArrowLeft') jumpToDay(state.currentDayIndex > 0 ? state.currentDayIndex - 1 : 5);
  }

  // Public API
  return {
    init,
    toggleFilterPanel,
    toggleBatchDropdown,
    toggleTheme,
    selectBatch,
    setViewMode,
    manualJumpToDay
  };

})();

// Start
document.addEventListener('DOMContentLoaded', TimetableApp.init);




