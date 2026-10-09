import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const $ = id => document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const dist2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

let scene,camera,renderer,clock;
let player,playerVisual,shadow;
let animals=[],resources=[],obstacles=[];
let worldGroup,resourceGroup,animalGroup;
let yaw=0,pitch=-0.16;
let cameraMode="third";
let running=false,paused=false,gameOver=false,missionLock=false;
let jumpY=0,jumpV=0,grounded=true;
let joystick={x:0,y:0},keys={};
let cameraTouch=null,lastSave=0;
let toastTimer=0;

const state={
  health:100,stamina:100,water:100,hunger:100,xp:0,coins:0,distance:0,
  elapsed:0,dayTime:8*60,mission:0,checkpoint:{x:0,z:0},lastSave:0,
  inventory:{Water:1,Food:2,Medicine:1,Wood:0,Herb:0},
  crouch:false,sprint:false,safe:false
};

const missions=[
 {title:"Reach the Ranger Station",desc:"Find the ranger station and enter the safe zone.",target:new THREE.Vector3(38,0,-48),radius:6,reward:"100 XP + 25 coins"},
 {title:"Collect Water",desc:"Find the water cache and collect fresh water.",target:new THREE.Vector3(-58,0,-28),radius:5,reward:"75 XP + 15 coins + water"},
 {title:"Cross the Wild",desc:"Reach the ridge without being killed by wildlife.",target:new THREE.Vector3(70,0,55),radius:7,reward:"200 XP + 75 coins"}
];

function mat(color,rough=.8){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:.03});}
function box(w,h,d,m){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);}
function cyl(r,h,m){return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,10),m);}
function sphere(r,m){return new THREE.Mesh(new THREE.SphereGeometry(r,12,10),m);}

function makeTree(x,z,s=1){
  const g=new THREE.Group();
  const trunk=cyl(.35*s,3*s,mat(0x5a3b20)); trunk.position.y=1.5*s; g.add(trunk);
  const crown=sphere(2.1*s,mat(0x234c25)); crown.position.y=4*s; g.add(crown);
  g.position.set(x,0,z); worldGroup.add(g);
  obstacles.push({x,z,r:1.7*s,solid:true});
}
function makeRock(x,z,s=1){
  const r=new THREE.Mesh(new THREE.DodecahedronGeometry(1.4*s,0),mat(0x686653));
  r.scale.y=.65;r.position.set(x,1*s,z);worldGroup.add(r);obstacles.push({x,z,r:1.5*s,solid:true});
}
function makeBuilding(x,z){
  const g=new THREE.Group();const b=box(7,3.2,7,mat(0x9b7042));b.position.y=1.6;g.add(b);
  const roof=box(8,1,8,mat(0x3b3024));roof.position.y=3.7;roof.rotation.y=.78;g.add(roof);
  g.position.set(x,0,z);worldGroup.add(g);obstacles.push({x,z,r:5,solid:true});
}
function makeWater(x,z){
  const w=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,.18,24),new THREE.MeshStandardMaterial({color:0x268cc0,transparent:true,opacity:.72,roughness:.15}));
  w.position.set(x,.12,z);worldGroup.add(w);
}
function makeResource(type,x,z){
  const g=new THREE.Group();
  let color=type==="Water"?0x37a8d8:type==="Food"?0xb78b35:0x7ac56a;
  const obj=sphere(.55,mat(color));obj.position.y=.65;g.add(obj);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.06,6,20),mat(color));ring.rotation.x=Math.PI/2;ring.position.y=.1;g.add(ring);
  g.position.set(x,0,z);resourceGroup.add(g);resources.push({type,x,z,group:g,active:true,spin:rand(0,6)});
}
function makeAnimal(type,x,z){
  const g=new THREE.Group();
  const body=sphere(type==="Elephant"?1.6:1.05,mat(type==="Lion"?0xb37a32:type==="Hyena"?0x75684c:type==="Zebra"?0xd8d1b8:type==="Crocodile"?0x3e6b43:0x888b7e));
  body.scale.set(1.35,.85,1.8);body.position.y=1.25;g.add(body);
  const head=sphere(type==="Elephant"?1.0:.75,mat(type==="Lion"?0xc28a43:type==="Hyena"?0x806f51:type==="Zebra"?0xd8d1b8:type==="Crocodile"?0x466f47:0x8d8f82));
  head.position.set(0,1.45,-1.55);g.add(head);
  if(type==="Zebra"){
    for(let i=-1;i<=1;i++)for(let j=0;j<2;j++){const s=box(.08,.7,.04,mat(0x202020));s.position.set((j?-.43:.43),1.25+i*.3,-1.8);s.rotation.y=.1;g.add(s);}
  }
  if(type==="Elephant"){const trunk=cyl(.18,1.6,mat(0x777a70));trunk.position.set(0,.55,-2.05);trunk.rotation.x=Math.PI/2;g.add(trunk);}
  const legMat=mat(type==="Elephant"?0x73776e:type==="Zebra"?0xd8d1b8:0x4d3c2a);
  for(const sx of [-.65,.65])for(const sz of [-.8,.8]){const l=cyl(.16,type==="Elephant"?1.8:1.2,legMat);l.position.set(sx*.7,.6,sz*.65);g.add(l);}
  g.position.set(x,0,z);animalGroup.add(g);
  animals.push({type,group:g,x,z,speed:type==="Cheetah"?4.8:type==="Lion"?3.8:type==="Hyena"?3:type==="Elephant"?1.5:type==="Crocodile"?1.2:2.1,
    detect:type==="Elephant"?13:type==="Crocodile"?10:16,attack:type==="Elephant"?3:2.2,state:"wander",dir:rand(0,Math.PI*2),timer:rand(1,4),damageTimer:0,phase:rand(0,6)});
}

function buildWorld(){
  worldGroup=new THREE.Group();resourceGroup=new THREE.Group();animalGroup=new THREE.Group();
  scene.add(worldGroup,resourceGroup,animalGroup);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,260,1,1),mat(0x6b7541));ground.rotation.x=-Math.PI/2;worldGroup.add(ground);
  const road=box(10,.08,250,mat(0x6c563d));road.position.y=.04;worldGroup.add(road);
  for(let i=0;i<95;i++){
    const x=rand(-120,120),z=rand(-120,120);
    if(Math.abs(x)<8)continue;
    makeTree(x,z,rand(.65,1.35));
  }
  for(let i=0;i<30;i++)makeRock(rand(-115,115),rand(-115,115),rand(.5,1.5));
  makeBuilding(38,-48);
  makeWater(-58,-28);
  makeWater(-70,35);
  makeWater(78,-22);
  makeResource("Water",-58,-28);
  makeResource("Food",-20,22);makeResource("Food",48,-4);makeResource("Medicine",8,62);makeResource("Herb",-76,48);
  makeAnimal("Lion",24,-5);makeAnimal("Lion",68,28);makeAnimal("Elephant",-35,42);
  makeAnimal("Zebra",-45,-65);makeAnimal("Zebra",62,-70);makeAnimal("Hyena",-60,8);
  makeAnimal("Crocodile",78,-22);
  makeAnimal("Elephant",95,55);
  const ridge=box(16,1.5,10,mat(0x726348));ridge.position.set(70,.75,55);worldGroup.add(ridge);
}

function makePlayer(){
  player=new THREE.Group();player.position.set(0,0,0);
  const shadowGeo=new THREE.CircleGeometry(1.05,18);
  shadow=new THREE.Mesh(shadowGeo,new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.3,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;player.add(shadow);
  playerVisual=new THREE.Group();
  const body=cyl(.42,1.15,mat(0x3b5b39));body.position.y=1.25;playerVisual.add(body);
  const head=sphere(.34,mat(0x9a6847));head.position.y=2.05;playerVisual.add(head);
  const pack=box(.55,.75,.3,mat(0x283529));pack.position.set(0,1.35,.42);playerVisual.add(pack);
  const leg1=cyl(.12,.75,mat(0x22271f)),leg2=leg1.clone();leg1.position.set(-.18,.55,0);leg2.position.set(.18,.55,0);playerVisual.add(leg1,leg2);
  player.add(playerVisual);scene.add(player);
}

function init(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x8bb6a0);
  scene.fog=new THREE.Fog(0x8bb6a0,55,170);
  camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,400);
  camera.position.set(0,4.2,6);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $("game").appendChild(renderer.domElement);
  clock=new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xbfe6d3,0x463c27,1.6));
  const sun=new THREE.DirectionalLight(0xffe3a5,2.0);sun.position.set(-50,90,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);

  buildWorld();makePlayer();bindUI();loadSettings();animate();
  setTimeout(()=>{$("loading").classList.add("hidden");},450);
}
function bindUI(){
  $("playBtn").onclick=()=>startGame(false);
  $("continueBtn").onclick=()=>{if(loadGame()){startGame(false)}else toast("No saved game found");};
  $("newBtn").onclick=()=>{resetState();startGame(false)};
  $("settingsBtn").onclick=()=>openOverlay("settings");
  $("pauseBtn").onclick=()=>setPaused(true);
  $("resumeBtn").onclick=()=>setPaused(false);
  $("inventoryBtn").onclick=()=>{renderInventory();openOverlay("inventory")};
  $("missionBtn").onclick=()=>{renderMission();openOverlay("missionPanel")};
  $("pauseSettingsBtn").onclick=()=>openOverlay("settings");
  $("checkpointBtn").onclick=()=>restartCheckpoint();
  $("mainMenuBtn").onclick=mainMenu;
  $("closeInventory").onclick=()=>closeOverlay("inventory");
  $("closeMission").onclick=()=>closeOverlay("missionPanel");
  $("closeSettings").onclick=()=>closeOverlay("settings");
  $("continueMission").onclick=()=>{$("complete").classList.add("hidden");missionLock=false;paused=false;running=true;};
  $("restartBtn").onclick=restartCheckpoint;
  $("gameOverMenu").onclick=mainMenu;
  $("graphics").onchange=()=>applyGraphics($("graphics").value);
  $("soundToggle").onchange=saveSettings;$("vibrationToggle").onchange=saveSettings;
  $("sprintBtn").onpointerdown=e=>{e.preventDefault();state.sprint=true;$("sprintBtn").classList.add("active")};
  $("sprintBtn").onpointerup=$("sprintBtn").onpointercancel=()=>{state.sprint=false;$("sprintBtn").classList.remove("active")};
  $("crouchBtn").onclick=()=>{state.crouch=!state.crouch;$("crouchBtn").classList.toggle("active",state.crouch)};
  $("jumpBtn").onclick=jump;
  $("interactBtn").onclick=interact;
  $("cameraBtn").onclick=toggleCamera;
  setupJoystick();setupCameraTouch();
  addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="Space")jump();if(e.code==="KeyE")interact();if(e.code==="KeyV")toggleCamera();if(e.code==="ShiftLeft"||e.code==="ShiftRight")state.sprint=true;if(e.code==="ControlLeft"||e.code==="ControlRight")state.crouch=true;});
  addEventListener("keyup",e=>{keys[e.code]=false;if(e.code==="ShiftLeft"||e.code==="ShiftRight")state.sprint=false;if(e.code==="ControlLeft"||e.code==="ControlRight")state.crouch=false;});
  addEventListener("resize",resize);
}
function setupJoystick(){
  const zone=$("joystick"),stick=$("stick");
  const move=e=>{
    const r=zone.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    let x=(e.clientX-cx)/(r.width*.36),y=(e.clientY-cy)/(r.height*.36);const l=Math.hypot(x,y);if(l>1){x/=l;y/=l}
    joystick.x=x;joystick.y=y;stick.style.transform=`translate(${x*28}px,${y*28}px)`;
  };
  const end=()=>{joystick.x=joystick.y=0;stick.style.transform="translate(0,0)"};
  zone.onpointerdown=e=>{zone.setPointerCapture(e.pointerId);move(e)};
  zone.onpointermove=e=>{if(e.buttons)move(e)};
  zone.onpointerup=end;zone.onpointercancel=end;
}
function setupCameraTouch(){
  renderer.domElement.addEventListener("pointerdown",e=>{if(e.pointerType==="touch")cameraTouch={x:e.clientX,y:e.clientY,id:e.pointerId}});
  renderer.domElement.addEventListener("pointermove",e=>{
    if(!cameraTouch||e.pointerId!==cameraTouch.id)return;
    const dx=e.clientX-cameraTouch.x,dy=e.clientY-cameraTouch.y;cameraTouch.x=e.clientX;cameraTouch.y=e.clientY;
    yaw-=dx*.004;pitch=clamp(pitch-dy*.003,-.55,.35);
  });
  const end=e=>{if(cameraTouch&&e.pointerId===cameraTouch.id)cameraTouch=null};renderer.domElement.addEventListener("pointerup",end);renderer.domElement.addEventListener("pointercancel",end);
}
function startGame(reset){
  if(reset)resetState();
  running=true;paused=false;gameOver=false;missionLock=false;
  $("menu").classList.add("hidden");$("hud").classList.remove("hidden");
  $("pause").classList.add("hidden");$("gameover").classList.add("hidden");
  player.position.set(state.checkpoint.x,0,state.checkpoint.z);
  player.position.y=0;jumpY=0;jumpV=0;grounded=true;
  toast("Stay alert. The wilderness is alive.");
}
function resetState(){
  Object.assign(state,{health:100,stamina:100,water:100,hunger:100,xp:0,coins:0,distance:0,elapsed:0,dayTime:480,mission:0,checkpoint:{x:0,z:0},inventory:{Water:1,Food:2,Medicine:1,Wood:0,Herb:0},crouch:false,sprint:false,safe:false});
  saveGame();
}
function mainMenu(){
  running=false;paused=false;gameOver=false;
  $("hud").classList.add("hidden");$("pause").classList.add("hidden");$("gameover").classList.add("hidden");$("complete").classList.add("hidden");
  $("menu").classList.remove("hidden");
}
function setPaused(v){paused=v;if(v){running=true;$("pause").classList.remove("hidden")}else $("pause").classList.add("hidden")}
function openOverlay(id){$(id).classList.remove("hidden");}
function closeOverlay(id){$(id).classList.add("hidden");}
function restartCheckpoint(){
  closeOverlay("pause");closeOverlay("gameover");$("complete").classList.add("hidden");
  player.position.set(state.checkpoint.x,0,state.checkpoint.z);state.health=Math.max(55,state.health);state.stamina=100;state.safe=false;
  running=true;paused=false;gameOver=false;missionLock=false;toast("Checkpoint restored");
}
function jump(){
  if(!running||paused||gameOver||!grounded)return;
  grounded=false;jumpV=6.2;
}
function getInput(){
  let x=joystick.x,y=joystick.y;
  if(keys.KeyA)x-=1;if(keys.KeyD)x+=1;if(keys.KeyW)y-=1;if(keys.KeyS)y+=1;
  const l=Math.hypot(x,y);if(l>1){x/=l;y/=l}
  return {x,y};
}
function movePlayer(dt){
  const input=getInput(),mag=Math.hypot(input.x,input.y);
  const sprinting=state.sprint&&!state.crouch&&mag>.15&&state.stamina>1;
  let speed=state.crouch?2.0:sprinting?6.8:3.8;
  if(sprinting)state.stamina-=24*dt;else state.stamina+=state.crouch?10*dt:17*dt;
  state.stamina=clamp(state.stamina,0,100);
  if(mag>.05){
    const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)*0);
    const dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const velocity=right.multiplyScalar(input.x).add(dir.multiplyScalar(-input.y)).normalize().multiplyScalar(speed*mag*dt);
    const old=player.position.clone();player.position.add(velocity);
    player.position.x=clamp(player.position.x,-120,120);player.position.z=clamp(player.position.z,-120,120);
    for(const o of obstacles){const dx=player.position.x-o.x,dz=player.position.z-o.z,d=Math.hypot(dx,dz),min=.7+o.r;if(d<min){player.position.x=old.x;player.position.z=old.z;break;}}
    state.distance+=velocity.length();
    playerVisual.rotation.z=Math.sin(state.elapsed*12)*.04*(sprinting?1.5:1);
    player.rotation.y=Math.atan2(velocity.x,velocity.z);
  }
  jumpV-=16*dt;jumpY+=jumpV*dt;if(jumpY<=0){jumpY=0;jumpV=0;grounded=true}player.position.y=jumpY;
}
function updateAnimals(dt){
  let danger=false;
  for(const a of animals){
    if(!a.group.parent)continue;
    const p=player.position;const d=Math.hypot(p.x-a.group.position.x,p.z-a.group.position.z);
    const stealth=state.crouch&&!state.sprint;
    const detect=a.detect*(stealth?.62:1);
    const hostile=a.type==="Lion"||a.type==="Hyena"||a.type==="Crocodile";
    if(hostile&&d<detect){a.state="chase";danger=true}
    else if(a.state==="chase"&&d>detect*1.35)a.state="wander";
    if(a.state==="chase"){
      const dx=p.x-a.group.position.x,dz=p.z-a.group.position.z,len=Math.hypot(dx,dz)||1;
      a.group.position.x+=dx/len*a.speed*dt;a.group.position.z+=dz/len*a.speed*dt;a.group.rotation.y=Math.atan2(dx,dz);
      if(d<a.attack){a.damageTimer-=dt;if(a.damageTimer<=0){damage(a.type==="Lion"?18:a.type==="Hyena"?12:22);a.damageTimer=1.15}}
    }else{
      a.timer-=dt;if(a.timer<=0){a.timer=rand(2,5);a.dir+=rand(-1.7,1.7)}
      a.group.position.x+=Math.sin(a.dir)*a.speed*.22*dt;a.group.position.z+=Math.cos(a.dir)*a.speed*.22*dt;
      a.group.rotation.y=a.dir;
      a.group.position.x=clamp(a.group.position.x,-115,115);a.group.position.z=clamp(a.group.position.z,-115,115);
    }
    a.group.position.y=0;
    const walking=d<detect*.7&&!stealth;a.group.scale.y=1+Math.sin(state.elapsed*5+a.phase)*.025*(walking?1:0);
  }
  state.safe=dist2(player.position,missions[0].target)<10;
  if(state.safe)danger=false;
  const badge=$("dangerBadge");badge.textContent=danger?"DANGER":"SAFE";badge.classList.toggle("danger-state",danger);
}
function damage(amount){
  if(state.safe||gameOver)return;
  state.health-=amount;state.health=clamp(state.health,0,100);
  if(navigator.vibrate&&$("vibrationToggle").checked)navigator.vibrate(100);
  toast(`Danger! -${amount} health`);
  if(state.health<=0){gameOver=true;running=false;$("gameover").classList.remove("hidden");saveGame()}
}
function interact(){
  if(!running||paused||gameOver)return;
  let best=null,bd=4.5;
  for(const r of resources)if(r.active){const d=Math.hypot(player.position.x-r.x,player.position.z-r.z);if(d<bd){bd=d;best=r}}
  if(best){
    best.active=false;best.group.visible=false;
    state.inventory[best.type]=(state.inventory[best.type]||0)+1;
    if(best.type==="Water")state.water=100;
    state.xp+=15;state.coins+=3;toast(`Collected ${best.type}`);
    return;
  }
  const d=dist2(player.position,missions[state.mission].target);
  if(d<missions[state.mission].radius+1)completeMission();
}
function completeMission(){
  if(missionLock)return;
  missionLock=true;
  const m=missions[state.mission];state.xp+=state.mission===2?200:100;state.coins+=state.mission===2?75:25;
  state.checkpoint={x:m.target.x,z:m.target.z};
  if(state.mission<missions.length-1)state.mission++;else state.mission=0;
  saveGame();running=false;
  $("completeTitle").textContent=m.title;$("completeReward").textContent=`Reward: ${m.reward}`;
  $("complete").classList.remove("hidden");
}
function updateNeeds(dt){
  state.elapsed+=dt;state.dayTime=(state.dayTime+dt*0.35)%1440;
  state.water=clamp(state.water-dt*.22,0,100);state.hunger=clamp(state.hunger-dt*.12,0,100);
  if(state.water<=0||state.hunger<=0)state.health-=dt*1.8;
  if(state.water<20||state.hunger<20)toastTimer-=dt;
  if(state.health<=0){state.health=0;gameOver=true;running=false;$("gameover").classList.remove("hidden")}
}
function updateLighting(){
  const t=state.dayTime/1440,angle=t*Math.PI*2-Math.PI/2;
  const daylight=clamp(Math.sin(angle)*.5+.5,0,1);
  scene.background.setHSL(.30,.20,.18+.35*daylight);
  scene.fog.color.copy(scene.background);
  const light=scene.children.find(o=>o.isDirectionalLight);if(light)light.intensity=.55+1.65*daylight;
}
function toggleCamera(){
  cameraMode=cameraMode==="third"?"first":"third";
  playerVisual.visible=cameraMode!=="first";
  $("cameraBtn").textContent=cameraMode==="first"?"CAMERA: 1ST":"CAMERA: 3RD";
  toast(cameraMode==="first"?"First-person view":"Third-person view");
}
function updateCamera(){
  if(cameraMode==="first"){
    const eye=new THREE.Vector3(player.position.x,player.position.y+(state.crouch?1.55:2.0),player.position.z);
    const forward=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    camera.position.lerp(eye,.28);camera.lookAt(eye.clone().add(forward.multiplyScalar(12)));
    return;
  }
  const target=new THREE.Vector3(player.position.x,player.position.y+(state.crouch?1.65:2.15),player.position.z);
  const distance=state.crouch?5.4:6.2;
  const desired=new THREE.Vector3(
    target.x+Math.sin(yaw)*distance*Math.cos(pitch),
    target.y+3.0+Math.sin(pitch)*distance,
    target.z+Math.cos(yaw)*distance*Math.cos(pitch)
  );
  camera.position.lerp(desired,.13);camera.lookAt(target);
}
function updateResources(dt){
  for(const r of resources)if(r.active){r.spin+=dt;r.group.rotation.y=r.spin;r.group.position.y=Math.sin(r.spin*2)*.08}
}
function updateUI(){
  $("healthBar").style.width=state.health+"%";$("healthText").textContent=Math.ceil(state.health);
  $("staminaBar").style.width=state.stamina+"%";$("waterBar").style.width=state.water+"%";$("hungerBar").style.width=state.hunger+"%";
  $("coins").textContent=state.coins;$("xp").textContent=state.xp;$("distance").textContent=Math.floor(state.distance);
  const m=missions[state.mission];$("missionTitle").textContent=m.title;$("missionDistance").textContent=Math.floor(dist2(player.position,m.target))+" m";
  const h=Math.floor(state.dayTime/60)%24,mm=Math.floor(state.dayTime%60);$("timeText").textContent=String(h).padStart(2,"0")+":"+String(mm).padStart(2,"0");
  let nearest=null,bd=4.5;for(const r of resources)if(r.active){const d=dist2(player,r);if(d<bd){bd=d;nearest=r}}
  $("prompt").textContent=nearest?`USE: collect ${nearest.type}`:dist2(player,m.target)<missions[state.mission].radius+1?"USE: complete mission":"";
  drawMap();
}
function drawMap(){
  const c=$("map"),ctx=c.getContext("2d"),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#15281b";ctx.fillRect(0,0,w,h);
  const sx=w/240,sy=h/240,px=player.position.x+120,pz=player.position.z+120;
  ctx.strokeStyle="#876d4c";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();
  for(const a of animals){ctx.fillStyle=(a.state==="chase"?"#ff5555":"#e1c36a");ctx.fillRect((a.group.position.x+120)*sx-2,(a.group.position.z+120)*sy-2,4,4)}
  const m=missions[state.mission].target;ctx.fillStyle="#64d8ff";ctx.beginPath();ctx.arc((m.x+120)*sx,(m.z+120)*sy,4,0,7);ctx.fill();
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(px*sx,pz*sy,4,0,7);ctx.fill();
}
function renderInventory(){
  $("inventoryList").innerHTML=Object.entries(state.inventory).map(([k,v])=>`<div class="item"><span>${k}</span><b>${v}</b></div>`).join("");
}
function renderMission(){
  const m=missions[state.mission];$("missionDescription").textContent=m.desc;$("missionReward").textContent=m.reward;
}
function toast(msg){
  $("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>$("toast").classList.remove("show"),1800);
}
function saveGame(){
  const data={...state,checkpoint:{...state.checkpoint},inventory:{...state.inventory}};
  localStorage.setItem("wildAfricaSave",JSON.stringify(data));lastSave=performance.now();
}
function loadGame(){
  try{
    const raw=localStorage.getItem("wildAfricaSave");if(!raw)return false;
    const d=JSON.parse(raw);Object.assign(state,d);state.checkpoint=d.checkpoint||{x:0,z:0};state.inventory=d.inventory||state.inventory;
    return true;
  }catch(e){console.warn(e);return false}
}
function saveSettings(){
  localStorage.setItem("wildAfricaSettings",JSON.stringify({graphics:$("graphics").value,sound:$("soundToggle").checked,vibration:$("vibrationToggle").checked}));
  applyGraphics($("graphics").value);
}
function loadSettings(){
  try{const s=JSON.parse(localStorage.getItem("wildAfricaSettings")||"{}");if(s.graphics)$("graphics").value=s.graphics;if(typeof s.sound==="boolean")$("soundToggle").checked=s.sound;if(typeof s.vibration==="boolean")$("vibrationToggle").checked=s.vibration;applyGraphics($("graphics").value)}catch(e){}
}
function applyGraphics(v){
  const d=v==="high"?2:v==="medium"?1.5:1;
  renderer.setPixelRatio(Math.min(devicePixelRatio,d));
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
  if(running&&!paused&&!gameOver){
    movePlayer(dt);updateNeeds(dt);updateAnimals(dt);updateResources(dt);updateCamera();updateUI();updateLighting();
    if(performance.now()-lastSave>15000)saveGame();
  }else{updateCamera();updateLighting()}
  renderer.render(scene,camera);
}
init();
