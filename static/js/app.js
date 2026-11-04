const $ = (id) => document.getElementById(id);
const state = { students: [], marks: {}, savedMarks: {}, date: document.body.dataset.today };
let toastTimer;

async function api(url, options={}) {
  const response = await fetch(url, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}
function toast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>$("toast").classList.remove("show"), 2800);
}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();}
function escapeHtml(value){return String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function statusTag(status){return status ? '<span class="status-tag status-'+status+'">'+status+'</span>' : '<span class="status-tag status-none">Not marked</span>';}

async function refresh() {
  state.date = $("attendanceDate").value;
  const [list, stats] = await Promise.all([
    api('/api/students?date='+encodeURIComponent(state.date)+'&q='+encodeURIComponent($("searchInput").value)),
    api('/api/dashboard?date='+encodeURIComponent(state.date))
  ]);
  state.students = list.students;
  $("totalCount").textContent = stats.total; $("presentCount").textContent = stats.present;
  $("absentCount").textContent = stats.absent; $("unmarkedCount").textContent = stats.unmarked;
  $("presentHint").textContent = stats.late ? stats.late+' marked late' : 'Marked present';
  $("rosterCount").textContent = stats.total;
  $("tableSummary").textContent = stats.total+' student'+(stats.total===1?'':'s')+' in your class';
  $("exportLink").href = '/export.csv?date='+encodeURIComponent(state.date);
  renderStudents(); renderAttendance(); updateProgress();
}
function renderStudents() {
  const rows = $("studentRows");
  if (!state.students.length) {
    rows.innerHTML = '<tr><td colspan="6" class="empty">No students found. Select <b>Add student</b> to create your class list.</td></tr>'; return;
  }
  rows.innerHTML = state.students.map(s=>`<tr><td>${escapeHtml(s.roll_no)}</td><td><div class="student-cell"><span class="student-avatar">${escapeHtml(initials(s.name))}</span><span><span class="student-name">${escapeHtml(s.name)}</span>${s.email?'<span class="student-email">'+escapeHtml(s.email)+'</span>':''}</span></div></td><td>${escapeHtml(s.class_name||'—')}</td><td>${escapeHtml(s.phone||'—')}</td><td>${statusTag(s.status)}</td><td><div class="row-actions"><button class="icon-btn" title="Edit student details" data-edit="${s.id}">✎</button><button class="icon-btn" title="Delete student" data-delete="${s.id}">⌫</button></div></td></tr>`).join('');
  rows.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editStudent(Number(b.dataset.edit))));
  rows.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteStudent(Number(b.dataset.delete))));
}
function renderAttendance() {
  const wrap = $("attendanceList");
  if (!state.students.length) {wrap.innerHTML='<div class="empty">Add students first to start taking attendance.</div>';return;}
  wrap.innerHTML = state.students.map(s=>{
    const mark = state.marks[s.id] || s.status || "";
    return `<div class="attendance-row"><div class="attendance-person"><span class="student-avatar">${escapeHtml(initials(s.name))}</span><span><b>${escapeHtml(s.name)}</b><small>Roll no. ${escapeHtml(s.roll_no)}</small></span></div><div class="status-options">${["Present","Absent","Late"].map(status=>'<button class="status-choice '+(mark===status?'selected':'')+'" data-status="'+status+'" data-id="'+s.id+'">'+status+'</button>').join('')}</div></div>`;
  }).join('');
  wrap.querySelectorAll('[data-status]').forEach(b=>b.addEventListener('click',()=>{
    state.marks[b.dataset.id]=b.dataset.status; renderAttendance(); updateProgress();
  }));
}
function updateProgress(){
  const marked = state.students.filter(s=>state.marks[s.id]||s.status).length;
  $("attendanceProgress").textContent = marked+' of '+state.students.length+' marked';
}
function openModal(student=null){
  $("studentForm").reset(); $("studentId").value=student?.id||"";
  $("modalTitle").textContent=student?"Edit student":"Add a student";
  $("submitStudent").textContent=student?"Update student":"Save student";
  if(student){$("studentName").value=student.name;$("studentRoll").value=student.roll_no;$("studentClass").value=student.class_name;$("studentPhone").value=student.phone;$("studentEmail").value=student.email;}
  $("studentModal").classList.add("show"); $("studentModal").setAttribute("aria-hidden","false"); $("studentName").focus();
}
function closeModal(){$("studentModal").classList.remove("show");$("studentModal").setAttribute("aria-hidden","true");}
function editStudent(id){const s=state.students.find(x=>x.id===id);if(s)openModal(s);}
async function deleteStudent(id){
  const s=state.students.find(x=>x.id===id);if(!s)return;
  if(!confirm('Delete '+s.name+' and all of their attendance history? This cannot be undone.'))return;
  try{const result=await api('/api/students/'+id,{method:'DELETE'});delete state.marks[id];toast(result.message);await refresh();}catch(e){toast(e.message);}
}
$("addStudentBtn").addEventListener('click',()=>openModal());
$("closeModal").addEventListener('click',closeModal);$("cancelModal").addEventListener('click',closeModal);
$("studentModal").addEventListener('click',e=>{if(e.target===$("studentModal"))closeModal();});
$("studentForm").addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$("studentId").value;
  const payload={name:$("studentName").value.trim(),roll_no:$("studentRoll").value.trim(),class_name:$("studentClass").value.trim(),phone:$("studentPhone").value.trim(),email:$("studentEmail").value.trim()};
  try{const result=await api(id?'/api/students/'+id:'/api/students',{method:id?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast(result.message);await refresh();}
  catch(err){toast(err.message);}
});
$("searchInput").addEventListener('input',()=>refresh().catch(e=>toast(e.message)));
$("attendanceDate").addEventListener('change',()=>{state.marks={};refresh().catch(e=>toast(e.message));});
$("allPresentBtn").addEventListener('click',()=>{state.students.forEach(s=>state.marks[s.id]='Present');renderAttendance();updateProgress();toast('Everyone set to Present. Remember to save.');});
$("clearMarksBtn").addEventListener('click',()=>{state.marks={};renderAttendance();updateProgress();toast('Unsaved marks cleared.');});
$("saveAttendanceBtn").addEventListener('click',async()=>{
  const entries=state.students.filter(s=>state.marks[s.id]||s.status).map(s=>({student_id:s.id,status:state.marks[s.id]||s.status}));
  if(!entries.length){toast('Mark attendance for at least one student first.');return;}
  try{const result=await api('/api/attendance',{method:'POST',body:JSON.stringify({date:state.date,entries})});state.marks={};toast(result.message);await refresh();}
  catch(e){toast(e.message);}
});
document.querySelectorAll('[data-scroll]').forEach(b=>b.addEventListener('click',()=>{document.getElementById(b.dataset.scroll).scrollIntoView({behavior:'smooth'});document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===b));}));

const tourSteps=[
 {title:'Welcome to Attendly!',text:'This is your simple student attendance workspace. We will show you the main areas in a few quick steps.'},
 {title:'Add your students',text:'Tap “Add student” to enter a name and a unique roll number. Class, phone and email are optional. Use the pencil icon to edit details later.'},
 {title:'Mark daily attendance',text:'Choose the date, then tap Present, Absent or Late beside each student. “All present” is a shortcut. Press “Save attendance” to store your marks.'},
 {title:'Find and export records',text:'Search by student name or roll number. Use “Download CSV” to open the selected day’s attendance in a spreadsheet. You can replay this guide anytime.'}
];
let tourIndex=0;
function showTour(){tourIndex=0;$("tourBackdrop").hidden=false;paintTour();}
function paintTour(){const s=tourSteps[tourIndex];$("tourStep").textContent='QUICK GUIDE · '+(tourIndex+1)+' OF '+tourSteps.length;$("tourTitle").textContent=s.title;$("tourText").textContent=s.text;$("nextTour").innerHTML=tourIndex===tourSteps.length-1?'Got it ✓':'Next →';}
function finishTour(){ $("tourBackdrop").hidden=true;localStorage.setItem('attendly-tour-seen','yes');}
$("nextTour").addEventListener('click',()=>{if(tourIndex<tourSteps.length-1){tourIndex++;paintTour();}else finishTour();});
$("skipTour").addEventListener('click',finishTour);$("helpBtn").addEventListener('click',showTour);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
refresh().then(()=>{if(!localStorage.getItem('attendly-tour-seen'))showTour();}).catch(e=>toast(e.message));
