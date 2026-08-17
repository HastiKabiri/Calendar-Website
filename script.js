(function () {
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let selectedDate = null;
  let currentHeader = null;
  let savedDates = new Set();
  const memoryFallback = {};

  const calendarView = document.getElementById('calendarView');
  const noteView = document.getElementById('noteView');
  const calTitle = document.getElementById('calTitle');
  const calBody = document.getElementById('calBody');
  const weekdayRow = document.getElementById('weekdayRow');
  const noteDate = document.getElementById('noteDate');
  const noteArea = document.getElementById('noteArea');
  const saveIndicator = document.getElementById('saveIndicator');
  const todayLabel = document.getElementById('todayLabel');
  const headerBanner = document.getElementById('headerBanner');
  const headerFileInput = document.getElementById('headerFileInput');
  const inlineFileInput = document.getElementById('inlineFileInput');
  const fontSelect = document.getElementById('fontSelect');
  const insertTableBtn = document.getElementById('insertTableBtn');
  const insertImageBtn = document.getElementById('insertImageBtn');
  const locationBtn = document.getElementById('locationBtn');
  const locationInputInline = document.getElementById('locationInputInline');
  const locationModal = document.getElementById('locationModal');
  const locationInput = document.getElementById('locationInput');
  const saveLocationBtn = document.getElementById('saveLocationBtn');
  const cancelLocationBtn = document.getElementById('cancelLocationBtn');
  const geoBtn = document.getElementById('geoBtn');
  const tableModal = document.getElementById('tableModal');
  const tableRows = document.getElementById('tableRows');
  const tableCols = document.getElementById('tableCols');
  const createTableBtn = document.getElementById('createTableBtn');
  const cancelTableBtn = document.getElementById('cancelTableBtn');
  const imageEditorModal = document.getElementById('imageEditorModal');
  const editCanvas = document.getElementById('editCanvas');
  const canvasWrap = document.getElementById('canvasWrap');
  const cropOverlay = document.getElementById('cropOverlay');
  const cropBox = document.getElementById('cropBox');
  const rotateLeftBtn = document.getElementById('rotateLeftBtn');
  const rotateRightBtn = document.getElementById('rotateRightBtn');
  const applyEditBtn = document.getElementById('applyEditBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  function pad(n){ return String(n).padStart(2,'0'); }
  function toKey(y,m,d){ return `note:${y}-${pad(m+1)}-${pad(d)}`; }
  function dateStr(y,m,d){ return `${y}-${pad(m+1)}-${pad(d)}`; }

  todayLabel.textContent = `today — ${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

  WEEKDAYS.forEach(w=>{
    const th = document.createElement('th');
    th.textContent = w;
    weekdayRow.appendChild(th);
  });

  /* ---------------- theme ---------------- */
  function applyTheme(name){
    document.documentElement.setAttribute('data-theme', name);
    document.querySelectorAll('.swatch').forEach(s=>{
      s.classList.toggle('active', s.dataset.theme === name);
    });
  }
  async function loadTheme(){
    let theme = 'paper';
    try{
      const result = await window.storage.get('theme', false);
      if(result && result.value) theme = result.value;
    }catch(e){ /* default stays */ }
    applyTheme(theme);
  }
  document.querySelectorAll('.swatch').forEach(btn=>{
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      try{ await window.storage.set('theme', theme, false); }catch(e){ console.warn('theme save failed', e); }
    });
  });

  /* ---------------- font ---------------- */
  function applyFont(font){
    document.documentElement.style.setProperty('--note-font', `'${font}', serif`);
    noteArea.style.fontFamily = `'${font}', serif`;
    if(fontSelect) fontSelect.value = font;
  }
  async function loadFont(){
    let font = 'Fraunces';
    try{
      const result = await window.storage.get('noteFont', false);
      if(result && result.value) font = result.value;
    }catch(e){ /* default stays */ }
    applyFont(font);
  }
  if(fontSelect){
    fontSelect.addEventListener('change', async () => {
      const font = fontSelect.value;
      applyFont(font);
      try{ await window.storage.set('noteFont', font, false); }catch(e){ console.warn('font save failed', e); }
    });
  }

  /* ---------------- location ---------------- */
  function applyLocation(loc){
    if(!loc){
      locationInputInline.value='';
      document.getElementById('book').classList.remove('has-location');
    }else{
      locationInputInline.value=loc;
      document.getElementById('book').classList.add('has-location');
    }
  }
  async function loadLocation(){
    let loc='';
    try{
      const result=await window.storage.get('noteLocation',false);
      if(result&&result.value) loc=result.value;
    }catch(e){}
    applyLocation(loc);
  }
  if(locationBtn){
    locationBtn.addEventListener('click', ()=>{
      locationInput.value=locationInputInline.value||'';
      locationModal.classList.remove('hidden');
      setTimeout(()=>locationInput.focus(),50);
    });
  }
  if(cancelLocationBtn){
    cancelLocationBtn.addEventListener('click', ()=>{
      locationModal.classList.add('hidden');
    });
  }
  if(saveLocationBtn){
    saveLocationBtn.addEventListener('click', async ()=>{
      const loc=locationInput.value.trim();
      applyLocation(loc);
      locationModal.classList.add('hidden');
      try{ await window.storage.set('noteLocation',loc,false); }catch(e){}
      scheduleSave();
    });
  }
  if(locationInput){
    locationInput.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ saveLocationBtn.click(); }
    });
  }
  if(geoBtn){
    geoBtn.addEventListener('click', async ()=>{
      try{
        const loc=await new Promise((resolve)=>{
          if(!navigator.geolocation) return resolve('');
          navigator.geolocation.getCurrentPosition(
            (pos)=>resolve(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
            ()=>resolve(''),
            { timeout:8000 }
          );
        });
        if(loc) locationInput.value=loc;
      }catch(e){}
    });
  }
  if(locationInputInline){
    locationInputInline.addEventListener('blur', async ()=>{
      const loc=locationInputInline.value.trim();
      applyLocation(loc);
      try{ await window.storage.set('noteLocation',loc,false); }catch(e){}
      scheduleSave();
    });
    locationInputInline.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ locationInputInline.blur(); }
    });
  }

  /* ---------------- calendar ---------------- */
  async function loadSavedDates(){
    savedDates = new Set();
    try{
      const result = await window.storage.list('note:', false);
      if(result && result.keys){
        result.keys.forEach(k => savedDates.add(k.replace('note:','')));
      }
    }catch(e){
      console.warn('Could not list saved notes', e);
    }
    renderCalendar();
  }

  function renderCalendar(){
    calTitle.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    calBody.innerHTML = '';

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInThisMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells = [];
    for(let i=0;i<startOffset;i++){
      const d = daysInPrevMonth - startOffset + 1 + i;
      const m = viewMonth===0 ? 11 : viewMonth-1;
      const y = viewMonth===0 ? viewYear-1 : viewYear;
      cells.push({d,m,y,out:true});
    }
    for(let d=1; d<=daysInThisMonth; d++){
      cells.push({d, m:viewMonth, y:viewYear, out:false});
    }
    while(cells.length % 7 !== 0 || cells.length < 35){
      const last = cells[cells.length-1];
      const nd = last.d+1;
      const m = viewMonth===11 ? 0 : viewMonth+1;
      const y = viewMonth===11 ? viewYear+1 : viewYear;
      cells.push({d:nd, m, y, out:true});
      if(cells.length>=42) break;
    }

    for(let row=0; row<cells.length/7; row++){
      const tr = document.createElement('tr');
      for(let col=0; col<7; col++){
        const c = cells[row*7+col];
        const td = document.createElement('td');
        const key = dateStr(c.y,c.m,c.d);
        const isToday = !c.out && c.y===today.getFullYear() && c.m===today.getMonth() && c.d===today.getDate();

        const btn = document.createElement('button');
        btn.className = 'day-cell' + (c.out ? ' out' : '') + (savedDates.has(key) && !c.out ? ' has-note' : '');
        btn.innerHTML = `<span class="day-num">${c.d}</span>`;
        if(isToday) td.classList.add('today');
        if(!c.out){
          btn.addEventListener('click', () => openNote(c.y, c.m, c.d));
        }else{
          btn.disabled = true;
        }
        td.appendChild(btn);
        tr.appendChild(td);
      }
      calBody.appendChild(tr);
    }
  }

  /* ---------------- note view ---------------- */
  function renderHeaderBanner(){
    headerBanner.innerHTML = '';
    if(currentHeader){
      const img = document.createElement('img');
      img.src = currentHeader;
      headerBanner.appendChild(img);
      const actions = document.createElement('div');
      actions.className = 'header-actions';
      actions.innerHTML = `<button class="icon-btn" id="headerEditBtn">edit</button><button class="icon-btn" id="changeHeaderBtn">change</button><button class="icon-btn" id="removeHeaderBtn">remove</button>`;
      headerBanner.appendChild(actions);
      document.getElementById('headerEditBtn').addEventListener('click', ()=>{
        const img = headerBanner.querySelector('img');
        if(img) openImageEditor(img);
      });
      document.getElementById('changeHeaderBtn').addEventListener('click', () => headerFileInput.click());
      document.getElementById('removeHeaderBtn').addEventListener('click', () => {
        currentHeader = null;
        renderHeaderBanner();
        scheduleSave();
      });
    }else{
      const empty = document.createElement('div');
      empty.className = 'header-empty';
      empty.textContent = '+ header photo';
      empty.addEventListener('click', () => headerFileInput.click());
      headerBanner.appendChild(empty);
    }
  }

  function updateEmptyState(){
    const text = noteArea.innerText.replace(/\s|\u200B/g,'');
    noteArea.classList.toggle('is-empty', text.length === 0);
  }

  async function openNote(y, m, d){
    selectedDate = {y,m,d};
    const dateObj = new Date(y,m,d);
    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dateObj.getDay()];
    noteDate.textContent = `${weekday}, ${MONTHS[m]} ${d}`;

    calendarView.classList.add('hidden');
    noteView.classList.remove('hidden');

    const key = toKey(y,m,d);
    noteArea.innerHTML = '';
    currentHeader = null;

    let raw = null;
    try{
      const result = await window.storage.get(key, false);
      raw = result ? result.value : (memoryFallback[key] || null);
    }catch(e){
      raw = memoryFallback[key] || null;
    }

    if(raw){
      try{
        const parsed = JSON.parse(raw);
        noteArea.innerHTML = parsed.content || '';
        currentHeader = parsed.header || null;
        const loc = parsed.location || '';
        applyLocation(loc);
      }catch(e){
        // legacy plain-text note saved before images/themes existed
        const p = document.createElement('p');
        p.textContent = raw;
        noteArea.appendChild(p);
        applyLocation('');
      }
    }else{
      applyLocation('');
    }
    renderHeaderBanner();
    updateEmptyState();
    noteArea.focus();
  }

  let saveTimer = null;
  function scheduleSave(){
    if(!selectedDate) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 500);
  }

  async function doSave(){
    if(!selectedDate) return;
    const key=toKey(selectedDate.y,selectedDate.m,selectedDate.d);
    const key2=dateStr(selectedDate.y,selectedDate.m,selectedDate.d);
    const textLen=noteArea.innerText.replace(/\s/g,'').length;
    const loc=locationInputInline.classList.contains('show')?locationInputInline.value:'';
    const hasContent=textLen>0||!!currentHeader||!!loc;
    const payload=JSON.stringify({content:noteArea.innerHTML,header:currentHeader,location:loc});
    memoryFallback[key]=payload;
    try{
      if(hasContent){
        await window.storage.set(key,payload,false);
        savedDates.add(key2);
      }else{
        await window.storage.delete(key,false).catch(()=>{});
        savedDates.delete(key2);
      }
      flashSaved();
    }catch(e){
      console.warn('Save failed, kept in memory only',e);
    }
  }

  function flashSaved(){
    saveIndicator.textContent = 'saved';
    saveIndicator.classList.add('show');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(()=> saveIndicator.classList.remove('show'), 1200);
  }

  noteArea.addEventListener('input', () => {
    updateEmptyState();
    scheduleSave();
  });
  noteArea.addEventListener('focusin', (e) => {
    const el = e.target;
    if(el.matches('table.note-table th[data-placeholder], table.note-table td[data-placeholder]')){
      el.textContent = '';
      el.removeAttribute('data-placeholder');
    }
  });

  headerFileInput.addEventListener('change', () => {
    const file = headerFileInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      currentHeader = reader.result;
      renderHeaderBanner();
      scheduleSave();
    };
    reader.readAsDataURL(file);
    headerFileInput.value = '';
  });

  let editorState = { img: null, originalSrc: '', rotation: 0, dragging: false, handle: null, startX: 0, startY: 0, startRect: null };

  function openImageEditor(imgEl){
    editorState.img = imgEl;
    editorState.originalSrc = imgEl.src;
    editorState.rotation = 0;
    editorState.dragging = false;
    editorState.handle = null;
    imageEditorModal.classList.remove('hidden');
    const editImage = document.getElementById('editImage');
    editImage.src = imgEl.src;
    editImage.style.transform = '';
    editImage.onload = ()=> initCropBox();
  }
  function closeImageEditor(){
    imageEditorModal.classList.add('hidden');
    editorState.img = null;
    editorState.crop = null;
  }
  function initCropBox(){
    const img = document.getElementById('editImage');
    const container = document.getElementById('imgContainer');
    const cropBox = document.getElementById('cropBox');
    if(!img || !container || !cropBox) return;
    container.style.width = img.clientWidth + 'px';
    container.style.height = img.clientHeight + 'px';
    cropBox.style.left = '0px';
    cropBox.style.top = '0px';
    cropBox.style.width = img.clientWidth + 'px';
    cropBox.style.height = img.clientHeight + 'px';
  }
  function rotateImage(deg){
    const editImage = document.getElementById('editImage');
    const image = new Image();
    image.onload = ()=>{
      const w = image.width;
      const h = image.height;
      const rad = deg * Math.PI / 180;
      const cw = deg===90||deg===270 ? h*Math.abs(Math.cos(rad)) + w*Math.abs(Math.sin(rad)) : w*Math.abs(Math.cos(rad)) + h*Math.abs(Math.sin(rad));
      const ch = deg===90||deg===270 ? w*Math.abs(Math.sin(rad)) + h*Math.abs(Math.cos(rad)) : w*Math.abs(Math.cos(rad)) + h*Math.abs(Math.sin(rad));
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d');
      ctx.translate(cw/2, ch/2);
      ctx.rotate(rad);
      ctx.drawImage(image, -w/2, -h/2);
      const newSrc = c.toDataURL('image/png');
      editorState.img.src = newSrc;
      editImage.src = newSrc;
      editImage.onload = ()=> initCropBox();
    };
    image.src = editorState.img.src;
  }
  function applyCrop(){
    if(!editorState.img) return;
    const editImage = document.getElementById('editImage');
    const cropBoxEl = document.getElementById('cropBox');
    const container = document.getElementById('imgContainer');
    if(!editImage || !cropBoxEl || !container) return;
    const containerRect = container.getBoundingClientRect();
    const cropRect = cropBoxEl.getBoundingClientRect();
    const scaleX = editImage.naturalWidth / editImage.clientWidth;
    const scaleY = editImage.naturalHeight / editImage.clientHeight;
    const sx = Math.max(0, (cropRect.left - containerRect.left) * scaleX);
    const sy = Math.max(0, (cropRect.top - containerRect.top) * scaleY);
    const sw = Math.min(editImage.naturalWidth - sx, cropRect.width * scaleX);
    const sh = Math.min(editImage.naturalHeight - sy, cropRect.height * scaleY);
    const c = document.createElement('canvas');
    c.width = Math.max(1, sw); c.height = Math.max(1, sh);
    const ctx = c.getContext('2d');
    ctx.drawImage(editImage, sx, sy, sw, sh, 0, 0, sw, sh);
    const result = c.toDataURL('image/png');
    editorState.img.src = result;
    closeImageEditor();
    scheduleSave();
  }

  if(cropBox){
    cropBox.addEventListener('mousedown', (e)=>{
      const handle = e.target.closest('.crop-handle');
      e.preventDefault();
      editorState.dragging = true;
      editorState.handle = handle ? handle.dataset.handle : 'move';
      editorState.startX = e.clientX;
      editorState.startY = e.clientY;
      editorState.startRect = cropBox.getBoundingClientRect();
    });
  }
  document.addEventListener('mousemove', (e)=>{
    if(!editorState.dragging) return;
    const cropBoxEl = document.getElementById('cropBox');
    const container = document.getElementById('imgContainer');
    if(!cropBoxEl || !container) return;
    const containerRect = container.getBoundingClientRect();
    const dx = e.clientX - editorState.startX;
    const dy = e.clientY - editorState.startY;
    const s = editorState.startRect;
    let left = s.left, top = s.top, width = s.width, height = s.height;
    if(editorState.handle === 'move'){
      left = s.left + dx;
      top = s.top + dy;
      if(left < containerRect.left) left = containerRect.left;
      if(top < containerRect.top) top = containerRect.top;
      if(left + width > containerRect.right) left = containerRect.right - width;
      if(top + height > containerRect.bottom) top = containerRect.bottom - height;
    }else{
      const h = editorState.handle;
      if(h.includes('e')) width = s.width + dx;
      if(h.includes('s')) height = s.height + dy;
      if(h.includes('w')) { left = s.left + dx; width = s.width - dx; }
      if(h.includes('n')) { top = s.top + dy; height = s.height - dy; }
      if(width < 30) { if(h.includes('w')) left = s.left + s.width - 30; width = 30; }
      if(height < 30) { if(h.includes('n')) top = s.top + s.height - 30; height = 30; }
      if(left < containerRect.left) { width += left - containerRect.left; left = containerRect.left; }
      if(top < containerRect.top) { height += top - containerRect.top; top = containerRect.top; }
      if(left + width > containerRect.right) width = containerRect.right - left;
      if(top + height > containerRect.bottom) height = containerRect.bottom - top;
    }
    cropBoxEl.style.left = left + 'px';
    cropBoxEl.style.top = top + 'px';
    cropBoxEl.style.width = width + 'px';
    cropBoxEl.style.height = height + 'px';
  });
  document.addEventListener('mouseup', ()=>{
    editorState.dragging = false;
    editorState.handle = null;
    editorState.startRect = null;
  });

  if(rotateLeftBtn) rotateLeftBtn.addEventListener('click', ()=> rotateImage(-90));
  if(rotateRightBtn) rotateRightBtn.addEventListener('click', ()=> rotateImage(90));
  if(applyEditBtn) applyEditBtn.addEventListener('click', applyCrop);
  if(cancelEditBtn) cancelEditBtn.addEventListener('click', ()=>{
    if(editorState.originalSrc) editorState.img.src = editorState.originalSrc;
    closeImageEditor();
  });

  /* click inline images to edit */
  noteArea.addEventListener('click', (e)=>{
    const fig = e.target.closest('figure.pinned-photo');
    if(!fig) return;
    const img = fig.querySelector('img');
    if(img) openImageEditor(img);
  });

  /* edit header image */
  const headerEditBtn = document.getElementById('headerEditBtn');
  if(headerEditBtn){
    headerEditBtn.addEventListener('click', ()=>{
      const img = headerBanner.querySelector('img');
      if(img) openImageEditor(img);
    });
  }
  if(insertTableBtn){
    insertTableBtn.addEventListener('click', ()=>{
      tableRows.value=3; tableCols.value=3;
      tableModal.classList.remove('hidden');
    });
  }
  if(insertImageBtn){
    insertImageBtn.addEventListener('click', ()=>{
      inlineFileInput.click();
    });
  }
  if(cancelTableBtn){
    cancelTableBtn.addEventListener('click', ()=>{
      tableModal.classList.add('hidden');
    });
  }
  if(createTableBtn){
    createTableBtn.addEventListener('click', ()=>{
      const rows=Math.max(1,Math.min(50,parseInt(tableRows.value)||3));
      const cols=Math.max(1,Math.min(20,parseInt(tableCols.value)||3));
      tableModal.classList.add('hidden');
      noteArea.focus();
      let thead='';
      if(rows>0){
        thead='<thead><tr>';
        for(let c=0;c<cols;c++) thead+=`<th data-placeholder="true">Header ${c+1}</th>`;
        thead+='</tr></thead>';
      }
      let tbody='<tbody>';
      for(let r=0;r<Math.max(0,rows-1);r++){
        tbody+='<tr>';
        for(let c=0;c<cols;c++) tbody+=`<td data-placeholder="true">Cell</td>`;
        tbody+='</tr>';
      }
      tbody+='</tbody>';
      const html=`<table class="note-table">${thead}${tbody}</table><p><br></p>`;
      const sel=window.getSelection();
      if(sel&&sel.rangeCount&&noteArea.contains(sel.anchorNode)){
        document.execCommand('insertHTML',false,html);
      }else{
        noteArea.insertAdjacentHTML('beforeend',html);
      }
      updateEmptyState();
      scheduleSave();
    });
  }
  inlineFileInput.addEventListener('change', () => {
    const file = inlineFileInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const html = `<figure class="pinned-photo" contenteditable="false"><img src="${reader.result}" alt=""></figure><p><br></p>`;
      noteArea.focus();
      const sel = window.getSelection();
      if(sel && sel.rangeCount && noteArea.contains(sel.anchorNode)){
        document.execCommand('insertHTML', false, html);
      }else{
        noteArea.insertAdjacentHTML('beforeend', html);
      }
      updateEmptyState();
      scheduleSave();
    };
    reader.readAsDataURL(file);
    inlineFileInput.value = '';
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    noteView.classList.add('hidden');
    calendarView.classList.remove('hidden');
    renderCalendar();
  });

  document.getElementById('prevMonth').addEventListener('click', () => {
    viewMonth--;
    if(viewMonth<0){ viewMonth=11; viewYear--; }
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    viewMonth++;
    if(viewMonth>11){ viewMonth=0; viewYear++; }
    renderCalendar();
  });

  loadTheme();
  loadFont();
  loadLocation();
  loadSavedDates();
})();
