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

const MORNING={start:7.25,end:8.25};
const HOME={start:13,end:16};
let profileData={};

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
  if(!r.ok) throw new Error("Kunne ikke hente vejret");
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
    if(!r.time.startsWith(date))return false;
    const hour=Number(r.time.slice(11,13));
    return hour>=Math.floor(start)&&hour<=Math.ceil(end);
  });
}
const avg=a=>{const b=a.filter(Number.isFinite);return b.length?b.reduce((x,y)=>x+y,0)/b.length:0};
const max=a=>{const b=a.filter(Number.isFinite);return b.length?Math.max(...b):0};
const min=a=>{const b=a.filter(Number.isFinite);return b.length?Math.min(...b):0};

function aggregate(windows){
  const r=windows.flat();
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

function labelScore(s){
  if(s>=82)return{text:"Rigtig godt",cls:"good",bg:"green"};
  if(s>=65)return{text:"Godt",cls:"good",bg:"green"};
  if(s>=45)return{text:"Okay",cls:"okay",bg:"yellow"};
  if(s>=25)return{text:"Besværligt",cls:"bad",bg:"red"};
  return{text:"Dårligt",cls:"bad",bg:"red"};
}
function windLevel(ms){
  if(ms<5)return{text:"Lidt / ingen vind",cls:"good"};
  if(ms<9)return{text:"En del vind",cls:"okay"};
  return{text:"Kraftig vind",cls:"bad"};
}
function rainLevel(mm,pop){
  if(mm<.2&&pop<40)return{text:"Lidt / ingen regn",cls:"good"};
  if(mm<1.5&&pop<75)return{text:"Mulig / let regn",cls:"okay"};
  return{text:"Meget regn",cls:"bad"};
}

function metric(label,value,cls=""){
  return `<div class="metric"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
}
function renderDetails(id,w){
  const rain=rainLevel(w.precip,w.pop);
  const wind=windLevel(w.wind);
  document.getElementById(id).innerHTML =
    metric("Temperatur",`${Math.round(w.temp)}°`) +
    metric("Føles som",`${Math.round(w.feels)}°`) +
    metric("Vind",`${w.wind.toFixed(1)} m/s`,wind.cls) +
    metric("Vindniveau",wind.text,wind.cls) +
    metric("Vindstød",`${w.gust.toFixed(1)} m/s`,wind.cls) +
    metric("Regn",`${w.precip.toFixed(1)} mm`,rain.cls) +
    metric("Regnrisiko",`${Math.round(w.pop)}%`,rain.cls) +
    metric("Sne",w.snow>0?`${w.snow.toFixed(1)} cm`:"Ingen",w.snow>0?"bad":"good");
}

function tripWeatherFx(w){
  if(w.snow>0.05)return"snow";
  const rainSeverity=Math.max(w.precip/1.5,w.pop/75);
  const windSeverity=Math.max(w.wind/7,w.gust/11);
  if(rainSeverity>=windSeverity&&rainSeverity>.5)return"rain";
  if(windSeverity>.5)return"wind";
  return"";
}

function applyTrip(id,w){
  const s=scoreWeather(w);
  const label=labelScore(s);
  const card=document.getElementById(`${id}Card`);
  card.className=`trip trip-shell trip-${label.bg}`;
  document.getElementById(`${id}Score`).textContent=`${s}/100`;
  document.getElementById(`${id}Label`).textContent=label.text;
  document.getElementById(`${id}Fx`).className=`weather-fx ${tripWeatherFx(w)}`;
  renderDetails(id,w);
  return s;
}

function renderProfile(key,morning,home){
  profileData[key]={morning,home};

  const morningId=`${key}Morning`;
  const homeId=`${key}Home`;

  const s1=applyTrip(morningId,morning);
  const s2=applyTrip(homeId,home);
  const avgScore=Math.round((s1+s2)/2);
  const l=labelScore(avgScore);

  const badge=document.getElementById(`${key}Badge`);
  badge.textContent=`${avgScore}/100`;
  badge.className=`score-badge ${l.cls}`;
  return avgScore;
}

function dominantWeather(trips){
  const snow=max(trips.map(x=>x.snow));
  const rain=Math.max(max(trips.map(x=>x.precip))/1.5,max(trips.map(x=>x.pop))/75);
  const wind=Math.max(max(trips.map(x=>x.wind))/7,max(trips.map(x=>x.gust))/11);
  if(snow>0.05 && snow>=rain && snow>=wind)return"snow";
  if(rain>=wind && rain>.5)return"rain";
  if(wind>.5)return"wind";
  return"sun";
}

function clothingFor(w){
  const items=[];
  const t=w.feels;
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
  if(!d)return;
  const w={
    temp:Math.min(d.morning.temp,d.home.temp),
    feels:Math.min(d.morning.feels,d.home.feels),
    pop:Math.max(d.morning.pop,d.home.pop),
    precip:Math.max(d.morning.precip,d.home.precip),
    snow:Math.max(d.morning.snow,d.home.snow),
    wind:Math.max(d.morning.wind,d.home.wind)
  };
  document.getElementById("clothesTitle").textContent=`${PROFILES[key].name} – forslag til i dag`;
  document.getElementById("clothesWeather").textContent=
    `Føles som ned til ca. ${Math.round(w.feels)}°, vind op til ${w.wind.toFixed(1)} m/s og ${Math.round(w.pop)}% regnrisiko.`;
  document.getElementById("clothesContent").innerHTML=
    clothingFor(w).map(x=>`<div class="clothing-item">${x}</div>`).join("");
  document.getElementById("clothesDialog").showModal();
}

function showDetails(id){
  document.getElementById(`${id}Overlay`).classList.add("hidden");
  document.getElementById(`${id}Details`).classList.remove("hidden");
}
function showOverlay(id){
  document.getElementById(`${id}Details`).classList.add("hidden");
  document.getElementById(`${id}Overlay`).classList.remove("hidden");
}

async function loadWeather(){
  document.getElementById("overallText").textContent="Henter vejret…";
  try{
    const scores=[];
    for(const [key,p] of Object.entries(PROFILES)){
      const responses=await Promise.all(p.points.map(fetchPoint));
      const morning=aggregate(responses.map(x=>pick(rows(x),MORNING.start,MORNING.end)));
      const home=aggregate(responses.map(x=>pick(rows(x),HOME.start,HOME.end)));
      scores.push(renderProfile(key,morning,home));
    }

    const overall=Math.round(avg(scores));
    const label=labelScore(overall);

    const summary=document.getElementById("summary");
    summary.className=`summary-card summary-${label.bg}`;
    document.getElementById("overallText").textContent=`${label.text} cykelvejr · ${overall}/100`;

    const trips=Object.values(profileData).flatMap(x=>[x.morning,x.home]);
    const worstWind=max(trips.map(x=>x.wind));
    const worstRain=max(trips.map(x=>x.precip));
    const minFeels=min(trips.map(x=>x.feels));

    let details=`Føles som ned til ${Math.round(minFeels)}°. Vind op til ${worstWind.toFixed(1)} m/s.`;
    details += worstRain>=.2 ? ` Op til ${worstRain.toFixed(1)} mm nedbør.` : " Ingen nævneværdig regn.";
    document.getElementById("summaryDetails").textContent=details;

    document.getElementById("weatherAnimation").className=`weather-animation ${dominantWeather(trips)}`;
    document.getElementById("updated").textContent=
      `Opdateret kl. ${new Date().toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})}`;
  }catch(e){
    console.error(e);
    document.getElementById("overallText").textContent="Kunne ikke hente vejret";
    document.getElementById("summaryDetails").textContent="Kontrollér internetforbindelsen og tryk på opdater.";
  }
}

document.querySelectorAll("[data-show-details]").forEach(el=>{
  el.addEventListener("click",()=>showDetails(el.dataset.showDetails));
});
document.querySelectorAll("[data-back]").forEach(el=>{
  el.addEventListener("click",e=>{
    e.stopPropagation();
    showOverlay(el.dataset.back);
  });
});
document.querySelectorAll("[data-clothes]").forEach(el=>{
  el.addEventListener("click",()=>openClothes(el.dataset.clothes));
});
document.getElementById("closeDialog").addEventListener("click",()=>document.getElementById("clothesDialog").close());
document.getElementById("refreshBtn").addEventListener("click",loadWeather);

if("serviceWorker"in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));
}

loadWeather();
setInterval(loadWeather,15*60*1000);
