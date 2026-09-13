const socket=io();let code="",state=null,role="";
const $=id=>document.getElementById(id);
function show(id){$(id).classList.remove("hidden")}function hide(id){$(id).classList.add("hidden")}
$("create").onclick=()=>{const n=$("name").value.trim();if(n)socket.emit("createRoom",{name:n})};
$("join").onclick=()=>{const n=$("name").value.trim(),c=$("room").value.trim().toUpperCase();if(n&&c)socket.emit("joinRoom",{name:n,code:c})};
socket.on("joined",c=>{code=c;hide("home");show("game");$("roomLabel").textContent="ROOM "+c});
socket.on("errorMsg",m=>$("err").textContent=m);
socket.on("private",d=>{role=d.role;$("role").textContent=role==="suspect"?"YOU ARE THE SUSPECT":"YOU ARE A DETECTIVE";$("secret").innerHTML=d.secretWords.map(w=>`<span>${w}</span>`).join("")});
socket.on("state",s=>{state=s;$("scenario").textContent=s.scenario||"Menunggu game dimulai...";$("timer").textContent=s.timeLeft?s.timeLeft+"s":"--";$("phaseTitle").textContent=({lobby:"LOBBY",prep:"PREPARE YOUR ALIBI",interrogation:"INTERROGATION",guess:"LOCK YOUR GUESS",reveal:"THE TRUTH"})[s.phase]||"FAKE ALIBI";$("players").innerHTML="<b>PLAYERS</b>"+s.players.map(p=>`<div class="player"><span>${p.name}${p.id===s.suspectId&&s.phase!=="lobby"?" 🕵️":""}</span><span>${p.score} pts</span></div>`).join("");if(s.phase==="lobby"&&s.players.length>=2)show("start");else hide("start");if(s.phase==="interrogation"){show("chatBox");hide("guessBox")}else hide("chatBox");if(s.phase==="guess"&&role==="detective")show("guessBox");else hide("guessBox");if(s.phase==="reveal")show("revealBox");else hide("revealBox");if(s.phase==="reveal")show("next");else hide("next")});
socket.on("tick",t=>$("timer").textContent=t+"s");
socket.on("chat",m=>{$("messages").insertAdjacentHTML("beforeend",`<div class="message"><b>${escapeHtml(m.name)}</b><br><p>${escapeHtml(m.text)}</p></div>`);$("messages").scrollTop=$("messages").scrollHeight});
socket.on("reveal",d=>{$("revealBox").innerHTML="<h3>THE TRUTH</h3><p>Secret words:</p>"+d.words.map(w=>`<b>${w}</b><br>`).join("")+"<p>Setiap detektif mendapat poin berdasarkan kata yang tepat. Tersangka mendapat poin untuk kata yang berhasil disembunyikan.</p>"});
$("start").onclick=()=>socket.emit("startGame",code);
$("send").onclick=send;$("msg").onkeydown=e=>{if(e.key==="Enter")send()};function send(){const x=$("msg").value.trim();if(x){socket.emit("chat",{code,text:x});$("msg").value=""}}
$("lock").onclick=()=>{socket.emit("submitGuess",{code,guesses:[...document.querySelectorAll(".guess")].map(x=>x.value)});hide("guessBox")};
$("next").onclick=()=>socket.emit("nextRound",code);
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
