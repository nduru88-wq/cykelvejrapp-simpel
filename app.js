const PROFILES={
  peter:{name:"Peter",points:[{lat:57.006,lon:9.765},{lat:57.005,lon:9.874}]},
  son:{name:"Charlie",points:[{lat:57.006,lon:9.765},{lat:56.995,lon:9.726}]}
};
const MORNING={start:7.25,end:8.25},HOME={start:13,end:16};

let profileData={};
let weatherRows={};
let selectedDate=stripTime(new Date());
let weekMode=false;

function stripTime(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function pad2(n){return String(n).padStart(2,"0");}
function dateISO(d){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;}
function cloneDate(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function addDays(d,n){const x=cloneDate(d);x.setDate(x.getDate()+n);return x;}
function formatLongDate(d){return d.toLocaleDateString("da-DK",{weekday:"long",day:"numeric",month:"long"});}
function capitalize(s){return s?String(s).charAt(0).toUpperCase()+String(s).slice(1):"";}
function mondayOfWeek(d){const x=cloneDate(d),day=x.getDay();x.setDate(x.getDate()+(day===0?-6:1-day));return x;}
function weekNumber(d){
  const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=x.getUTCDay()||7;
  x.setUTCDate(x.getUTCDate()+4-day);
  const start=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return Math.ceil((((x-start)/86400000)+1)/7);
}

async function fetchPoint(point){
  const vars=["temperature_2m","apparent_temperature","precipitation_probability","precipitation","rain","snowfall","wind_speed_10m","wind_gusts_10m"].join(",");
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}&hourly=${vars}&timezone=Europe%2FCopenhagen&past_days=7&forecast_days=10&wind_speed_unit=ms`;
  const r=await fetch(url);
  if(!r.ok)throw new Error("Kunne ikke hente vejret");
  return r.json();
}

function rows(raw){
  const h=raw.hourly;
  return h.time.map((time,i)=>({
    time,
    temp:h.temperature_2m[i],
    feels:h.apparent_temperature[i],
    pop:h.precipitation_probability[i],
    precip:h.precipitation[i],
    rain:h.rain[i],
    snow:h.snowfall[i],
    wind:h.wind_speed_10m[i],
    gust:h.wind_gusts_10m[i]
  }));
}

function pick(list,date,start,end){
  const iso=dateISO(date);
  return list.filter(r=>{
    if(!r.time.startsWith(iso))return false;
    const hour=Number(r.time.slice(11,13));
    return hour>=Math.floor(start)&&hour<=Math.ceil(end);
  });
}

const avg=a=>{const b=a.filter(Number.isFinite);return b.length?b.reduce((x,y)=>x+y,0)/b.length:0};
const max=a=>{const b=a.filter(Number.isFinite);return b.length?Math.max(...b):0};
const min=a=>{const b=a.filter(Number.isFinite);return b.length?Math.min(...b):0};

function aggregate(windows){
  const r=windows.flat();
  if(!r.length)return null;
  return{
    temp:avg(r.map(x=>x.temp)),
    feels:avg(r.map(x=>x.feels)),
    pop:max(r.map(x=>x.pop)),
    precip:max(r.map(x=>x.precip)),
    rain:max(r.map(x=>x.rain)),
    snow:max(r.map(x=>x.snow)),
    wind:max(r.map(x=>x.wind)),
    gust:max(r.map(x=>x.gust))
  };
}

function scoreWeather(w){
  if(!w)return null;
  let s=100;
  if(w.precip>=4)s-=35; else if(w.precip>=1.5)s-=23; else if(w.precip>=.2||w.pop>=55)s-=12;
  if(w.snow>=.2)s-=35;
  if(w.wind>=9.7)s-=33; else if(w.wind>=6.9)s-=21; else if(w.wind>=5)s-=10;
  if(w.gust>=15.3)s-=20; else if(w.gust>=11.1)s-=10;
  if(w.feels<=0)s-=18; else if(w.feels<=5)s-=10; else if(w.feels>=28)s-=10;
  return Math.max(0,Math.round(s));
}

function labelScore(s){
  if(!Number.isFinite(s))return{text:"Ingen data",cls:"neutral",bg:"neutral"};
  if(s>=82)return{text:"Rigtig godt",cls:"good",bg:"green"};
  if(s>=65)return{text:"Godt",cls:"good",bg:"green"};
  if(s>=45)return{text:"Okay",cls:"okay",bg:"yellow"};
  if(s>=25)return{text:"Besværligt",cls:"bad",bg:"red"};
  return{text:"Dårligt",cls:"bad",bg:"red"};
}

function scoreBandClass(s){
  if(!Number.isFinite(s))return"score-band-neutral";
  if(s>=95)return"score-band-100";
  if(s>=85)return"score-band-90";
  if(s>=75)return"score-band-80";
  if(s>=65)return"score-band-70";
  if(s>=55)return"score-band-60";
  if(s>=45)return"score-band-50";
  if(s>=35)return"score-band-40";
  if(s>=25)return"score-band-30";
  if(s>=15)return"score-band-20";
  if(s>=5)return"score-band-10";
  return"score-band-0";
}

function windLevel(ms){if(ms<5)return{text:"Lidt / ingen vind",cls:"good"};if(ms<9)return{text:"En del vind",cls:"okay"};return{text:"Kraftig vind",cls:"bad"};}
function rainLevel(mm,pop){if(mm<.2&&pop<40)return{text:"Lidt / ingen regn",cls:"good"};if(mm<1.5&&pop<75)return{text:"Mulig / let regn",cls:"okay"};return{text:"Meget regn",cls:"bad"};}
function metric(label,value,cls=""){return `<div class="metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;}

function renderDetails(id,w){
  const el=document.getElementById(id);
  if(!w){el.innerHTML=`<div class="metric"><div class="label">Vejrdata</div><div class="value">Ikke tilgængelig</div></div>`;return;}
  const rain=rainLevel(w.precip,w.pop),wind=windLevel(w.wind);
  el.innerHTML=
    metric("Temperatur",`${Math.round(w.temp)}°`)+
    metric("Føles som",`${Math.round(w.feels)}°`)+
    metric("Vind",`${w.wind.toFixed(1)} m/s`,wind.cls)+
    metric("Vindniveau",wind.text,wind.cls)+
    metric("Vindstød",`${w.gust.toFixed(1)} m/s`,wind.cls)+
    metric("Regn",`${w.precip.toFixed(1)} mm`,rain.cls)+
    metric("Regnrisiko",`${Math.round(w.pop)}%`,rain.cls)+
    metric("Sne",w.snow>0?`${w.snow.toFixed(1)} cm`:"Ingen",w.snow>0?"bad":"good");
}

function tripWeatherFx(w){
  if(!w)return"sun";
  if(w.snow>0.05)return"snow";
  const rain=Math.max(w.precip/1.5,w.pop/75),wind=Math.max(w.wind/7,w.gust/11);
  if(rain>=wind&&rain>.5)return"rain";
  if(wind>.5)return"wind";
  return"sun";
}

function weatherIcon(w){
  const fx=tripWeatherFx(w);
  return fx==="snow"?"🌨️":fx==="rain"?"🌧️":fx==="wind"?"💨":"☀️";
}

function applyTrip(id,w){
  const s=scoreWeather(w),label=labelScore(s);
  document.getElementById(`${id}Card`).className=`trip trip-shell trip-${label.bg} ${scoreBandClass(s)}`;
  document.getElementById(`${id}Score`).textContent=Number.isFinite(s)?`${s}/100`:"–";
  document.getElementById(`${id}Label`).textContent=label.text;
  document.getElementById(`${id}Fx`).className=`static-weather ${tripWeatherFx(w)}`;
  renderDetails(id,w);
  return s;
}

function getProfileDayWeather(key,date){
  const pointRows=weatherRows[key]||[];
  const morning=aggregate(pointRows.map(x=>pick(x,date,MORNING.start,MORNING.end)));
  const home=aggregate(pointRows.map(x=>pick(x,date,HOME.start,HOME.end)));
  return{morning,home};
}

function renderProfile(key,morning,home){
  profileData[key]={morning,home};
  const s1=applyTrip(`${key}Morning`,morning),s2=applyTrip(`${key}Home`,home);
  const scores=[s1,s2].filter(Number.isFinite);
  const avgScore=scores.length?Math.round(avg(scores)):null;
  const l=labelScore(avgScore);
  const badge=document.getElementById(`${key}Badge`);
  badge.textContent=Number.isFinite(avgScore)?`${avgScore}/100`:"–";
  badge.className=`score-badge ${l.cls}`;
  return avgScore;
}

function dominantWeather(trips){
  const valid=trips.filter(Boolean);
  if(!valid.length)return"sun";
  const snow=max(valid.map(x=>x.snow));
  const rain=Math.max(max(valid.map(x=>x.precip))/1.5,max(valid.map(x=>x.pop))/75);
  const wind=Math.max(max(valid.map(x=>x.wind))/7,max(valid.map(x=>x.gust))/11);
  if(snow>0.05&&snow>=rain&&snow>=wind)return"snow";
  if(rain>=wind&&rain>.5)return"rain";
  if(wind>.5)return"wind";
  return"sun";
}

function clothingFor(w){
  if(!w)return["Vejrdata er ikke tilgængelige for denne dag."];
  const items=[],t=w.feels;
  if(t<=0)items.push("🧥 Varm vinterjakke","🧤 Varme handsker","🧣 Halsedisse","👖 Varme bukser");
  else if(t<=5)items.push("🧥 Varm cykeljakke","🧤 Handsker","👕 Langærmet lag","👖 Lange bukser");
  else if(t<=10)items.push("🧥 Let vindjakke","👕 Langærmet trøje","👖 Lange bukser");
  else if(t<=15)items.push("🧥 Tynd vindjakke eller vest","👕 T-shirt / langærmet","👖 Lange eller 3/4-bukser");
  else if(t<=21)items.push("👕 T-shirt","🩳 Shorts eller lette bukser","🧥 Tynd vest om morgenen");
  else items.push("👕 Let T-shirt","🩳 Shorts","💧 Husk vand");
  if(w.precip>=.2||w.pop>=45)items.push("🌧️ Regnjakke");
  if(w.precip>=1.5)items.push("👖 Regnbukser");
  if(w.wind>=6.1)items.push("💨 Vindtæt yderlag");
  if(w.snow>0)items.push("❄️ Varme vandafvisende sko");
  return [...new Set(items)];
}

function openClothes(key){
  const d=profileData[key];
  if(!d||!d.morning||!d.home)return;
  const w={
    temp:Math.min(d.morning.temp,d.home.temp),
    feels:Math.min(d.morning.feels,d.home.feels),
    pop:Math.max(d.morning.pop,d.home.pop),
    precip:Math.max(d.morning.precip,d.home.precip),
    snow:Math.max(d.morning.snow,d.home.snow),
    wind:Math.max(d.morning.wind,d.home.wind)
  };
  document.getElementById("clothesTitle").textContent=`${PROFILES[key].name} – forslag til ${formatLongDate(selectedDate)}`;
  document.getElementById("clothesWeather").textContent=`Føles som ned til ca. ${Math.round(w.feels)}°, vind op til ${w.wind.toFixed(1)} m/s og ${Math.round(w.pop)}% regnrisiko.`;
  document.getElementById("clothesContent").innerHTML=clothingFor(w).map(x=>`<div class="clothing-item">${x}</div>`).join("");
  document.getElementById("clothesDialog").showModal();
}

function showDetails(id){document.getElementById(`${id}Overlay`).classList.add("hidden");document.getElementById(`${id}Details`).classList.remove("hidden");}
function showOverlay(id){document.getElementById(`${id}Details`).classList.add("hidden");document.getElementById(`${id}Overlay`).classList.remove("hidden");}

function renderSelectedDay(){
  document.getElementById("today").textContent=capitalize(formatLongDate(selectedDate));
  const scores=[];
  const allTrips=[];

  for(const key of Object.keys(PROFILES)){
    const d=getProfileDayWeather(key,selectedDate);
    const score=renderProfile(key,d.morning,d.home);
    if(Number.isFinite(score))scores.push(score);
    if(d.morning)allTrips.push(d.morning);
    if(d.home)allTrips.push(d.home);
  }

  const overall=scores.length?Math.round(avg(scores)):null;
  const label=labelScore(overall);
  const summary=document.getElementById("summary");
  summary.className=`summary-card summary-${label.bg} ${scoreBandClass(overall)}`;
  document.getElementById("overallText").textContent=Number.isFinite(overall)?`${label.text} cykelvejr · ${overall}/100`:"Ingen vejrdata for dagen";

  if(allTrips.length){
    const worstWind=max(allTrips.map(x=>x.wind));
    const worstRain=max(allTrips.map(x=>x.precip));
    const minFeels=min(allTrips.map(x=>x.feels));
    let details=`Føles som ned til ${Math.round(minFeels)}°. Vind op til ${worstWind.toFixed(1)} m/s.`;
    details+=worstRain>=.2?` Op til ${worstRain.toFixed(1)} mm nedbør.`:" Ingen nævneværdig regn.";
    document.getElementById("summaryDetails").textContent=details;
    document.getElementById("weatherAnimation").className=`weather-animation ${dominantWeather(allTrips)}`;
  }else{
    document.getElementById("summaryDetails").textContent="Vejrdata er ikke tilgængelige for den valgte dag.";
    document.getElementById("weatherAnimation").className="weather-animation sun";
  }

  document.getElementById("updated").textContent=`Opdateret kl. ${new Date().toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})}`;
}

function weekDayData(date){
  const profileScores=[];
  const trips=[];

  for(const key of Object.keys(PROFILES)){
    const d=getProfileDayWeather(key,date);
    const scores=[scoreWeather(d.morning),scoreWeather(d.home)].filter(Number.isFinite);
    if(scores.length)profileScores.push(Math.round(avg(scores)));
    if(d.morning)trips.push(d.morning);
    if(d.home)trips.push(d.home);
  }

  const score=profileScores.length?Math.round(avg(profileScores)):null;
  const label=labelScore(score);
  return{score,label,trips};
}

function renderWeekSummary(){
  const monday=mondayOfWeek(selectedDate);
  document.getElementById("weekTitle").textContent=`Uge ${weekNumber(monday)} · ${monday.toLocaleDateString("da-DK",{day:"numeric",month:"short"})} – ${addDays(monday,4).toLocaleDateString("da-DK",{day:"numeric",month:"short"})}`;

  const weekDays=document.getElementById("weekDays");
  weekDays.innerHTML="";

  for(let i=0;i<5;i++){
    const date=addDays(monday,i);
    const data=weekDayData(date);
    const btn=document.createElement("button");
    btn.type="button";
    const selected=dateISO(date)===dateISO(selectedDate);
    btn.className=`week-day ${data.label.cls} ${scoreBandClass(data.score)}${selected?" selected":""}`;
    btn.innerHTML=`
      <span class="week-day-name">${capitalize(date.toLocaleDateString("da-DK",{weekday:"long"}))}<br>${date.getDate()}/${date.getMonth()+1}</span>
      <span class="week-day-icon">${data.trips.length?weatherIconFromTrips(data.trips):"·"}</span>
      <span class="week-day-score">${Number.isFinite(data.score)?data.score+"/100":"–"}<small>${data.label.text}</small></span>
    `;
    btn.addEventListener("click",()=>{
      selectedDate=cloneDate(date);
      weekMode=false;
      renderAll();
    });
    weekDays.appendChild(btn);
  }
}

function weatherIconFromTrips(trips){
  const fx=dominantWeather(trips);
  return fx==="snow"?"🌨️":fx==="rain"?"🌧️":fx==="wind"?"💨":"☀️";
}

function renderMode(){
  const profiles=document.getElementById("profilesSection");
  const weekView=document.getElementById("weekView");

  profiles.classList.toggle("hidden",weekMode);
  weekView.classList.toggle("hidden",!weekMode);

  if(weekMode)renderWeekSummary();
}

function renderAll(){
  renderSelectedDay();
  renderMode();
}

function changeDay(delta){
  selectedDate=addDays(selectedDate,delta);
  renderAll();
}

function toggleWeek(show){
  weekMode=typeof show==="boolean"?show:!weekMode;
  renderMode();
}

async function loadWeather(){
  document.getElementById("overallText").textContent="Henter vejret…";
  try{
    weatherRows={};
    for(const [key,p] of Object.entries(PROFILES)){
      const responses=await Promise.all(p.points.map(fetchPoint));
      weatherRows[key]=responses.map(rows);
    }
    renderAll();
  }catch(e){
    console.error(e);
    document.getElementById("overallText").textContent="Kunne ikke hente vejret";
    document.getElementById("summaryDetails").textContent="Kontrollér internetforbindelsen og tryk på opdater.";
  }
}

document.querySelectorAll("[data-show-details]").forEach(el=>el.addEventListener("click",()=>showDetails(el.dataset.showDetails)));
document.querySelectorAll("[data-back]").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();showOverlay(el.dataset.back);}));
document.querySelectorAll("[data-clothes]").forEach(el=>el.addEventListener("click",()=>openClothes(el.dataset.clothes)));
document.getElementById("closeDialog").addEventListener("click",()=>document.getElementById("clothesDialog").close());
document.getElementById("refreshBtn").addEventListener("click",loadWeather);
document.getElementById("prevDayBtn").addEventListener("click",()=>changeDay(-1));
document.getElementById("nextDayBtn").addEventListener("click",()=>changeDay(1));
document.getElementById("weekToggleBtn").addEventListener("click",()=>toggleWeek(true));
document.getElementById("dayToggleBtn").addEventListener("click",()=>toggleWeek(false));

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));
loadWeather();
setInterval(loadWeather,15*60*1000);
