const PROFILES = {
  peter: {
    name: "Peter",
    points: [
      {lat: 57.006, lon: 9.765},
      {lat: 57.005, lon: 9.874}
    ]
  },
  son: {
    name: "Charlie",
    points: [
      {lat: 57.006, lon: 9.765},
      {lat: 56.995, lon: 9.726}
    ]
  }
};

const MORNING = {start:7.25,end:8.25};
const HOME = {start:13,end:16};
let profileData = {};

document.getElementById("today").textContent =
  new Date().toLocaleDateString("da-DK",{weekday:"long",day:"numeric",month:"long"});

function todayISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function fetchPoint(point){
  const vars=["temperature_2m","apparent_temperature","precipitation_probability","precipitation","rain","snowfall","wind_speed_10m","wind_gusts_10m"].join(",");
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}&hourly=${vars}&timezone=Europe%2FCopenhagen&forecast_days=2&wind_speed_unit=ms`;
  const r=await fetch(url);
  if(!r.ok) throw new Error("Vejr kunne ikke hentes");
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

function pick(list,start,end){
  const date=todayISO();
  return list.filter(r=>{
    if(!r.time.startsWith(date)) return false;
    const hour=Number(r.time.slice(11,13));
    return hour>=Math.floor(start)&&hour<=Math.ceil(end);
  });
}

const avg=a=>{const b=a.filter(Number.isFinite);return b.length?b.reduce((x,y)=>x+y,0)/b.length:0};
const max=a=>{const b=a.filter(Number.isFinite);return b.length?Math.max(...b):0};
const min=a=>{const b=a.filter(Number.isFinite);return b.length?Math.min(...b):0};

function aggregate(windows){
  const r=windows.flat();
  return {
    temp:avg(r.map(x=>x.temp)),
    feels:avg(r.map(x=>x.feels)),
    pop:max(r.map(x=>x.pop)),
    precip:max(r.map(x=>x.precip)),
    snow:max(r.map(x=>x.snow)),
    wind:max(r.map(x=>x.wind)),
    gust:max(r.map(x=>x.gust))
  };
}

function rainLevel(w){
  if(w.precip<.2 && w.pop<40) return {text:"Ingen/lidt",cls:"good"};
  if(w.precip<1.5 && w.pop<75) return {text:"Let/mulig",cls:"okay"};
  return {text:"Meget",cls:"bad"};
}
function windLevel(w){
  if(w.wind<5) return {text:"Rolig",cls:"good"};
  if(w.wind<9) return {text:"En del",cls:"okay"};
  return {text:"Kraftig",cls:"bad"};
}

function score(w){
  let s=100;
  if(w.precip>=4)s-=35;
  else if(w.precip>=1.5)s-=23;
  else if(w.precip>=.2||w.pop>=55)s-=12;
  if(w.snow>=.2)s-=35;
  if(w.wind>=9.7)s-=33;
  else if(w.wind>=6.9)s-=21;
  else if(w.wind>=5)s-=10;
  if(w.gust>=15.3)s-=20;
  else if(w.gust>=11.1)s-=10;
  if(w.feels<=0)s-=18;
  else if(w.feels<=5)s-=10;
  else if(w.feels>=28)s-=10;
  return Math.max(0,Math.round(s));
}
function scoreLabel(s){
  if(s>=82)return{text:"Rigtig godt",cls:"good",icon:"🚲"};
  if(s>=65)return{text:"Godt",cls:"good",icon:"👍"};
  if(s>=45)return{text:"Okay",cls:"okay",icon:"🙂"};
  if(s>=25)return{text:"Besværligt",cls:"bad",icon:"⚠️"};
  return{text:"Dårligt",cls:"bad",icon:"🌧️"};
}

function row(label,value,cls=""){
  return `<div class="row"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
}

function renderPeriod(id,w){
  const rain=rainLevel(w);
  const wind=windLevel(w);
  document.getElementById(id).innerHTML=
    row("Temperatur",`${Math.round(w.temp)}°`) +
    row("Vind",`${w.wind.toFixed(1)} m/s · ${wind.text}`,wind.cls) +
    row("Regn",`${w.precip.toFixed(1)} mm · ${rain.text}`,rain.cls);
}

function renderProfile(key,morning,home){
  profileData[key]={morning,home};
  renderPeriod(`${key}Morning`,morning);
  renderPeriod(`${key}Home`,home);

  const s=Math.round((score(morning)+score(home))/2);
  const l=scoreLabel(s);
  const el=document.getElementById(`${key}Status`);
  el.textContent=`${l.text} · ${s}`;
  el.className=`status-pill ${l.cls}`;
  return s;
}

function clothingFor(w){
  const items=[];
  const t=w.feels;
  if(t<=0) items.push("🧥 Varm jakke","🧤 Varme handsker","🧣 Halsedisse","👖 Varme bukser");
  else if(t<=5) items.push("🧥 Varm cykeljakke","🧤 Handsker","👕 Langærmet lag","👖 Lange bukser");
  else if(t<=10) items.push("🧥 Let vindjakke","👕 Langærmet trøje","👖 Lange bukser");
  else if(t<=15) items.push("🧥 Tynd vindjakke","👕 T-shirt/langærmet","👖 Lange eller 3/4-bukser");
  else if(t<=21) items.push("👕 T-shirt","🩳 Shorts/lette bukser","🧥 Tynd vest om morgenen");
  else items.push("👕 Let T-shirt","🩳 Shorts","💧 Vand");

  if(w.precip>=.2||w.pop>=45) items.push("🌧️ Regnjakke");
  if(w.precip>=1.5) items.push("👖 Regnbukser");
  if(w.wind>=6.1) items.push("💨 Vindtæt yderlag");
  if(w.snow>0) items.push("❄️ Varme vandafvisende sko");
  return [...new Set(items)];
}

function openClothes(key){
  const d=profileData[key];
  if(!d)return;
  const w={
    temp:Math.min(d.morning.temp,d.home.temp),
    feels:Math.min(d.morning.feels,d.home.feels),
    pop:Math.max(d.morning.pop,d.home.pop),
    precip:Math.max(d.morning.precip,d.home.precip),
    snow:Math.max(d.morning.snow,d.home.snow),
    wind:Math.max(d.morning.wind,d.home.wind)
  };
  document.getElementById("clothesTitle").textContent=`${PROFILES[key].name} – i dag`;
  document.getElementById("clothesWeather").textContent=`Føles som ned til ca. ${Math.round(w.feels)}°, vind op til ${w.wind.toFixed(1)} m/s.`;
  document.getElementById("clothesContent").innerHTML=clothingFor(w).map(x=>`<div class="clothes-item">${x}</div>`).join("");
  document.getElementById("clothesDialog").showModal();
}

async function loadWeather(){
  try{
    const scores=[];
    for(const [key,p] of Object.entries(PROFILES)){
      const responses=await Promise.all(p.points.map(fetchPoint));
      const morning=aggregate(responses.map(x=>pick(rows(x),MORNING.start,MORNING.end)));
      const home=aggregate(responses.map(x=>pick(rows(x),HOME.start,HOME.end)));
      scores.push(renderProfile(key,morning,home));
    }

    const overall=Math.round(avg(scores));
    const label=scoreLabel(overall);
    document.getElementById("overallText").textContent="Er det godt cykelvejr i dag?";
    document.getElementById("heroIcon").textContent=label.icon;
    document.getElementById("heroScore").textContent=`${label.text} · ${overall}/100`;

    const trips=Object.values(profileData).flatMap(x=>[x.morning,x.home]);
    const worstWind=max(trips.map(x=>x.wind));
    const worstRain=max(trips.map(x=>x.precip));
    const coldest=min(trips.map(x=>x.feels));

    let reason=`Føles som ned til ${Math.round(coldest)}° · vind op til ${worstWind.toFixed(1)} m/s`;
    if(worstRain>=.2) reason+=` · op til ${worstRain.toFixed(1)} mm regn`;
    else reason+=" · næsten ingen regn";
    document.getElementById("heroReason").textContent=reason;

    document.getElementById("updated").textContent=`Opdateret kl. ${new Date().toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})}`;
  }catch(e){
    console.error(e);
    document.getElementById("heroIcon").textContent="⚠️";
    document.getElementById("heroScore").textContent="Kunne ikke hente vejret";
    document.getElementById("heroReason").textContent="Kontrollér internetforbindelsen og tryk ↻.";
  }
}

document.querySelectorAll("[data-clothes]").forEach(btn=>btn.addEventListener("click",()=>openClothes(btn.dataset.clothes)));
document.getElementById("closeDialog").addEventListener("click",()=>document.getElementById("clothesDialog").close());
document.getElementById("refreshBtn").addEventListener("click",loadWeather);

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));
}

loadWeather();
setInterval(loadWeather,15*60*1000);
