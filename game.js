import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

var firebaseConfig = {
  apiKey: "AIzaSyDBCxwWsDQwNz8ouXC7v81HKX-yVk_MrJ8",
  authDomain: "eightes-town.firebaseapp.com",
  projectId: "eightes-town",
  storageBucket: "eightes-town.firebasestorage.app",
  messagingSenderId: "508136911390",
  appId: "1:508136911390:web:4213ac2a9e60be4c01740f"
};
var firebaseApp = initializeApp(firebaseConfig);
var db = getFirestore(firebaseApp);
var SCORES_COLLECTION = "candycatch_scores";

(function(){
  "use strict";

  var LOGICAL_W = 360, LOGICAL_H = 600;
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  canvas.width = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  ctx.scale(dpr, dpr);

  var scoreEl = document.getElementById("scoreVal");
  var timeEl = document.getElementById("timeVal");
  var livesEl = document.getElementById("livesVal");
  var startOverlay = document.getElementById("startOverlay");
  var endOverlay = document.getElementById("endOverlay");
  var startBtn = document.getElementById("startBtn");
  var retryBtn = document.getElementById("retryBtn");
  var muteBtn = document.getElementById("muteBtn");
  var bestPreview = document.getElementById("bestPreview");
  var finalScoreEl = document.getElementById("finalScore");
  var bestScoreEl = document.getElementById("bestScore");
  var endTitle = document.getElementById("endTitle");
  var rankinBanner = document.getElementById("rankinBanner");
  var leaderboardList = document.getElementById("leaderboardList");
  var playCountEl = document.getElementById("playCount");
  var nameInput = document.getElementById("nameInput");
  var nameSaveBtn = document.getElementById("nameSaveBtn");
  var nameSaveStatus = document.getElementById("nameSaveStatus");
  var bgm = document.getElementById("bgm");

  var BEST_KEY = "candycatch_best_v1";
  var MUTE_KEY = "candycatch_muted_v1";
  var NAME_KEY = "candycatch_name_v1";
  var DEFAULT_NAME = "名無しのおばけさん";
  var best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
  var muted = localStorage.getItem(MUTE_KEY) === "1";
  var cachedName = localStorage.getItem(NAME_KEY) || "";
  var currentScoreDocId = null;

  nameInput.value = cachedName;

  function refreshMuteBtn(){
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    bgm.muted = muted;
  }
  refreshMuteBtn();
  bestPreview.textContent = best > 0 ? "これまでの最高得点: " + best : "";

  muteBtn.addEventListener("click", function(){
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    refreshMuteBtn();
  });

  // ---------- background music ----------
  var BGM_VOLUME = 0.45;
  var BGM_FADE_OUT_SEC = 1.6;
  var BGM_PAUSE_SEC = 1.2;
  var BGM_FADE_IN_SEC = 0.6;
  var bgmStarted = false;
  var bgmFading = false;
  bgm.volume = BGM_VOLUME;
  bgm.muted = muted;

  function fadeAudio(target, seconds, onDone){
    var startVol = bgm.volume;
    var startTs = performance.now();
    function step(ts){
      var t = Math.min(1, (ts - startTs) / (seconds * 1000));
      bgm.volume = startVol + (target - startVol) * t;
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    requestAnimationFrame(step);
  }

  bgm.addEventListener("timeupdate", function(){
    if (bgmFading || !bgm.duration) return;
    if (bgm.currentTime >= bgm.duration - BGM_FADE_OUT_SEC){
      bgmFading = true;
      fadeAudio(0, BGM_FADE_OUT_SEC, function(){
        bgm.pause();
        setTimeout(function(){
          bgm.currentTime = 0;
          bgm.play();
          fadeAudio(BGM_VOLUME, BGM_FADE_IN_SEC, function(){ bgmFading = false; });
        }, BGM_PAUSE_SEC * 1000);
      });
    }
  });

  function startBgm(){
    if (bgmStarted) return;
    bgmStarted = true;
    bgm.volume = BGM_VOLUME;
    bgm.play().catch(function(){ bgmStarted = false; });
  }

  // ---------- ray sprite sheet ----------
  var raySheetImg = document.getElementById("raySheet");
  var SHEET_COLS = 4, SHEET_ROWS = 2, SHEET_FRAMES = SHEET_COLS * SHEET_ROWS;
  var raySheetReady = false;
  var frameW = 0, frameH = 0;

  function onSheetLoaded(){
    frameW = raySheetImg.naturalWidth / SHEET_COLS;
    frameH = raySheetImg.naturalHeight / SHEET_ROWS;
    raySheetReady = frameW > 0 && frameH > 0;
  }
  if (raySheetImg.complete && raySheetImg.naturalWidth){
    onSheetLoaded();
  } else {
    raySheetImg.addEventListener("load", onSheetLoaded);
  }

  var RAY_DISPLAY_H = 128;
  var rayAnim = { frame: 0, timer: 0, fps: 7, facing: 1 };

  // ---------- item sprites ----------
  var ITEM_BOX = 40; // items are scaled so their longest side fits this box
  var ITEM_IMAGE_SRC = {
    candy: "assets/items/item_candy.png",
    pumpkin: "assets/items/item_pumpkin.png",
    star: "assets/items/item_star.png",
    peanut: "assets/items/item_peanut.png",
    hourglass: "assets/items/item_clock.png",
    bat: "assets/items/item_bat.png",
    spider: "assets/items/item_spider.png",
    cursed: "assets/items/item_cursed-candy.png"
  };
  var ITEM_IMAGES = {};
  Object.keys(ITEM_IMAGE_SRC).forEach(function(key){
    var img = new Image();
    var entry = { img: img, ready: false };
    img.addEventListener("load", function(){ entry.ready = true; });
    img.src = ITEM_IMAGE_SRC[key];
    ITEM_IMAGES[key] = entry;
  });

  // ---------- background art ----------
  var bgImage = new Image();
  var bgReady = false;
  bgImage.addEventListener("load", function(){ bgReady = true; });
  bgImage.src = "assets/backgrounds/background.jpg";

  // ---------- sound ----------
  var audioCtx = null;
  function ensureAudio(){
    if (!audioCtx){
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
  }
  function tone(freq, dur, type, vol){
    if (muted || !audioCtx) return;
    var t0 = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.18, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function sfxCatch(){ tone(660, 0.12, "triangle", 0.16); }
  function sfxBonus(){ tone(880, 0.1, "triangle", 0.18); setTimeout(function(){ tone(1180, 0.14, "triangle", 0.16); }, 70); }
  function sfxHit(){ tone(160, 0.22, "sawtooth", 0.14); }
  function sfxCombo(){ tone(760, 0.08, "square", 0.12); setTimeout(function(){ tone(1020, 0.12, "square", 0.14); }, 60); }

  // ---------- state ----------
  var state = "start"; // start | playing | over
  var rayX = LOGICAL_W / 2;
  var rayTargetX = rayX;
  var dragging = false;
  var keyLeft = false, keyRight = false;
  var GAME_DURATION = 60;
  var score = 0, lives = 3, timeLeft = GAME_DURATION, elapsed = 0;
  var streak = 0;
  var spawnTimer = 0;
  var items = [];
  var popups = [];
  var lastTs = null;

  var doubleScoreTimer = 0;
  var reverseTimer = 0;
  var shrinkTimer = 0;
  var starBuffTimer = 0;
  var raySizeScale = 1;

  var STAR_BUFF_SECONDS = 7;
  var STAR_SPEED_MULT = 1.8;

  var RAY_BASELINE_Y = 555;
  var RAY_R = 34;
  var MOVE_SPEED = 110; // px/s — deliberately slow, waddling pace
  // basket catch point, relative to ray sprite's own footprint
  var BASKET_OFFSET_Y_RATIO = 0.14;
  var BASKET_CATCH_RADIUS = 34;

  var SHRINK_SCALE = 0.6;

  var ITEM_TYPES = [
    { key: "candy",    good: true,  weight: 34, score: 10, r: 13 },
    { key: "pumpkin",  good: true,  weight: 20, score: 20, r: 15 },
    { key: "star",     good: true,  weight: 6,  score: 40, r: 14 },
    { key: "peanut",   good: true,  weight: 5,  score: 25, r: 13, effect: "double",  effectSeconds: 10 },
    { key: "hourglass",good: true,  weight: 5,  score: 5,  r: 13, effect: "time",    effectValue: 5 },
    { key: "bat",      good: false, weight: 14, score: 0,  r: 15, losesLife: true },
    { key: "spider",   good: false, weight: 10, score: 0,  r: 13, losesLife: true, effect: "shrink",  effectSeconds: 4 },
    { key: "cursed",   good: false, weight: 6,  score: 0,  r: 19, sizeMul: 1.5, losesLife: false, effect: "reverse", effectSeconds: 3 }
  ];
  var TOTAL_WEIGHT = ITEM_TYPES.reduce(function(s, t){ return s + t.weight; }, 0);

  function pickType(){
    var r = Math.random() * TOTAL_WEIGHT;
    for (var i = 0; i < ITEM_TYPES.length; i++){
      r -= ITEM_TYPES[i].weight;
      if (r <= 0) return ITEM_TYPES[i];
    }
    return ITEM_TYPES[0];
  }

  function difficultyProgress(){
    return Math.min(1, elapsed / GAME_DURATION);
  }
  function lerp(a, b, t){ return a + (b - a) * t; }

  function scheduleSpawn(){
    var p = difficultyProgress();
    var min = lerp(560, 260, p);
    var max = lerp(950, 480, p);
    spawnTimer = min + Math.random() * (max - min);
  }

  function spawnItem(){
    var t = pickType();
    var sizeMul = t.key === "spider" ? (1 + Math.random() * 2) : (t.sizeMul || 1);
    var effR = t.r * sizeMul;
    var margin = effR + 6;
    var vy = lerp(120, 230, difficultyProgress()) + Math.random() * 30;
    if (t.key === "bat") vy *= 0.72;
    items.push({
      type: t,
      sizeMul: sizeMul,
      r: effR,
      x: margin + Math.random() * (LOGICAL_W - margin * 2),
      y: -20,
      vy: vy,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 2.2,
      age: 0,
      phase: Math.random() * Math.PI * 2
    });
    scheduleSpawn();
  }

  function addPopup(x, y, text, color){
    popups.push({ x: x, y: y, text: text, color: color, life: 0.8, t: 0 });
  }

  function updateHud(){
    scoreEl.textContent = score;
    timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
    timeEl.classList.toggle("time-low", timeLeft <= 10);
    var s = "";
    for (var i = 0; i < 3; i++){
      s += i < lives ? "❤️" : "<span class=\"lost\">❤️</span>";
    }
    livesEl.innerHTML = s;
  }

  function resetGame(){
    score = 0; lives = 3; timeLeft = GAME_DURATION; elapsed = 0; streak = 0;
    items = []; popups = [];
    rayX = rayTargetX = LOGICAL_W / 2;
    rayAnim.frame = 0; rayAnim.timer = 0;
    doubleScoreTimer = 0; reverseTimer = 0; shrinkTimer = 0; starBuffTimer = 0; raySizeScale = 1;
    scheduleSpawn();
    updateHud();
  }

  var countdownOverlay = document.getElementById("countdownOverlay");
  var countdownNum = document.getElementById("countdownNum");
  var COUNTDOWN_SEQUENCE = ["3", "2", "1", "スタート!"];
  var COUNTDOWN_DURATIONS = [700, 700, 700, 550];

  function showCountdownStep(idx){
    if (idx >= COUNTDOWN_SEQUENCE.length){
      countdownOverlay.hidden = true;
      state = "playing";
      return;
    }
    var isGo = idx === COUNTDOWN_SEQUENCE.length - 1;
    countdownNum.textContent = COUNTDOWN_SEQUENCE[idx];
    countdownNum.classList.toggle("go", isGo);
    countdownNum.classList.remove("pop");
    void countdownNum.offsetWidth;
    countdownNum.classList.add("pop");
    if (isGo) sfxBonus(); else tone(520, 0.09, "square", 0.15);
    setTimeout(function(){ showCountdownStep(idx + 1); }, COUNTDOWN_DURATIONS[idx]);
  }

  function startGame(){
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    startBgm();
    resetGame();
    state = "countdown";
    startOverlay.hidden = true;
    endOverlay.hidden = true;
    countdownOverlay.hidden = false;
    showCountdownStep(0);
  }

  function triggerTitleEmerge(text){
    endTitle.textContent = text;
    endTitle.classList.remove("show");
    void endTitle.offsetWidth;
    endTitle.classList.add("show");
  }

  function animateScoreCountUp(target, duration){
    var startTs = null;
    function step(ts){
      if (startTs === null) startTs = ts;
      var t = Math.min(1, (ts - startTs) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      finalScoreEl.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
      else finalScoreEl.textContent = target;
    }
    requestAnimationFrame(step);
  }

  function buildLeaderboardRow(rank, name, rowScore, isMe){
    var li = document.createElement("li");
    if (isMe) li.classList.add("me");
    var rankEl = document.createElement("span");
    rankEl.className = "leaderboard-rank";
    rankEl.textContent = rank;
    var nameEl = document.createElement("span");
    nameEl.className = "leaderboard-name";
    nameEl.textContent = name;
    var scoreEl = document.createElement("span");
    scoreEl.className = "leaderboard-score";
    scoreEl.textContent = rowScore;
    li.appendChild(rankEl);
    li.appendChild(nameEl);
    li.appendChild(scoreEl);
    return li;
  }

  function renderLeaderboard(rows){
    leaderboardList.innerHTML = "";
    if (!rows.length){
      var li = document.createElement("li");
      li.className = "leaderboard-empty";
      li.textContent = "まだ記録がありません";
      leaderboardList.appendChild(li);
      return false;
    }
    var madeTop = false;
    rows.forEach(function(row, i){
      var isMe = row.id === currentScoreDocId;
      if (isMe) madeTop = true;
      leaderboardList.appendChild(buildLeaderboardRow(i + 1, row.name, row.score, isMe));
    });
    return madeTop;
  }

  function refreshLeaderboard(){
    var scoresRef = collection(db, SCORES_COLLECTION);
    var topQuery = query(scoresRef, orderBy("score", "desc"), limit(5));
    return Promise.all([getDocs(topQuery), getCountFromServer(scoresRef)]).then(function(results){
      var rows = [];
      results[0].forEach(function(d){
        var data = d.data();
        rows.push({ id: d.id, name: data.name, score: data.score });
      });
      var madeTop = renderLeaderboard(rows);
      playCountEl.textContent = "総プレイ回数: " + results[1].data().count + "回";
      rankinBanner.hidden = !madeTop;
    });
  }

  function submitScoreAndShowLeaderboard(finalScore){
    var nameToSave = (cachedName || "").trim() || DEFAULT_NAME;
    playCountEl.textContent = "読み込み中…";
    leaderboardList.innerHTML = "";
    rankinBanner.hidden = true;
    currentScoreDocId = null;

    addDoc(collection(db, SCORES_COLLECTION), {
      name: nameToSave,
      score: finalScore,
      createdAt: serverTimestamp()
    }).then(function(docRef){
      currentScoreDocId = docRef.id;
      return refreshLeaderboard();
    }).catch(function(err){
      console.error("score submit failed", err);
      playCountEl.textContent = "ランキングを取得できませんでした";
    });
  }

  nameSaveBtn.addEventListener("click", function(){
    var val = nameInput.value.trim();
    cachedName = val;
    localStorage.setItem(NAME_KEY, val);
    if (!currentScoreDocId){
      nameSaveStatus.textContent = "保存しました";
      return;
    }
    updateDoc(doc(db, SCORES_COLLECTION, currentScoreDocId), { name: val || DEFAULT_NAME }).then(function(){
      nameSaveStatus.textContent = "保存しました!";
      return refreshLeaderboard();
    }).catch(function(err){
      console.error("name update failed", err);
      nameSaveStatus.textContent = "保存に失敗しました";
    });
  });

  function endGame(){
    state = "over";
    if (score > best){
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    triggerTitleEmerge(lives <= 0 ? "ライフがなくなった!" : "タイムアップ!");
    bestScoreEl.textContent = "さいこう記録: " + best + (score === best && score > 0 ? "(新記録!)" : "");
    nameInput.value = cachedName;
    nameSaveStatus.textContent = "";
    animateScoreCountUp(score, 1100);
    submitScoreAndShowLeaderboard(score);
    endOverlay.hidden = false;
  }

  startBtn.addEventListener("click", startGame);
  retryBtn.addEventListener("click", startGame);

  // ---------- input ----------
  function logicalX(clientX){
    var rect = canvas.getBoundingClientRect();
    var scaleX = LOGICAL_W / rect.width;
    return (clientX - rect.left) * scaleX;
  }

  canvas.addEventListener("pointerdown", function(e){
    dragging = true;
    rayTargetX = logicalX(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function(e){
    if (!dragging) return;
    rayTargetX = logicalX(e.clientX);
  });
  canvas.addEventListener("pointerup", function(){ dragging = false; });
  canvas.addEventListener("pointercancel", function(){ dragging = false; });

  window.addEventListener("keydown", function(e){
    if (e.key === "ArrowLeft") keyLeft = true;
    if (e.key === "ArrowRight") keyRight = true;
  });
  window.addEventListener("keyup", function(e){
    if (e.key === "ArrowLeft") keyLeft = false;
    if (e.key === "ArrowRight") keyRight = false;
  });

  // ---------- drawing ----------
  function drawBackground(t){
    if (bgReady){
      ctx.drawImage(bgImage, 0, 0, LOGICAL_W, LOGICAL_H);
      return;
    }

    // fallback gradient sky while the illustrated background loads
    var g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    g.addColorStop(0, "#2E1F45");
    g.addColorStop(0.55, "#4A3168");
    g.addColorStop(1, "#6B4A8C");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    for (var i = 0; i < 18; i++){
      var sx = (i * 53 + 20) % LOGICAL_W;
      var sy = (i * 97 + 30) % 380;
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.002 + i));
      ctx.globalAlpha = tw;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function raySpriteDims(){
    var h = RAY_DISPLAY_H * raySizeScale;
    var w = frameW > 0 ? h * (frameW / frameH) : h;
    return { w: w, h: h };
  }

  function getBasketPoint(){
    var dims = raySpriteDims();
    return {
      x: rayX,
      y: RAY_BASELINE_Y - dims.h + dims.h * BASKET_OFFSET_Y_RATIO
    };
  }

  function drawConfusionEffect(t, dims){
    var headX = rayX;
    var headY = RAY_BASELINE_Y - dims.h - 4;
    var starCount = 3;
    for (var i = 0; i < starCount; i++){
      var angle = t * 0.005 + i * (Math.PI * 2 / starCount);
      var ex = headX + Math.cos(angle) * dims.w * 0.34;
      var ey = headY + Math.sin(angle) * 5;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle * 2.4);
      ctx.beginPath();
      for (var k = 0; k < 5; k++){
        var a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
        var a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5);
        ctx.lineTo(Math.cos(a2) * 2.2, Math.sin(a2) * 2.2);
      }
      ctx.closePath();
      ctx.fillStyle = "#C9A6E0";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawRay(t){
    var dims = raySpriteDims();
    var left = rayX - dims.w / 2;
    var top = RAY_BASELINE_Y - dims.h;
    var confused = reverseTimer > 0;
    var starred = starBuffTimer > 0;

    if (starred){
      ctx.save();
      var glowPulse = 0.75 + 0.25 * Math.sin(t * 0.012);
      var glowR = dims.w * 0.95 * glowPulse;
      var glowCy = top + dims.h / 2;
      var grad = ctx.createRadialGradient(rayX, glowCy, 4, rayX, glowCy, glowR);
      grad.addColorStop(0, "rgba(240,180,41,0.55)");
      grad.addColorStop(1, "rgba(240,180,41,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rayX, glowCy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // soft ground shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#1B1230";
    ctx.beginPath();
    ctx.ellipse(rayX, RAY_BASELINE_Y + 4, dims.w * 0.32, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!raySheetReady){
      // fallback while the sprite sheet loads
      ctx.save();
      ctx.fillStyle = "#3D8FD1";
      ctx.beginPath();
      ctx.ellipse(rayX, RAY_BASELINE_Y - dims.h / 2, dims.w / 2.6, dims.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    var col = rayAnim.frame % SHEET_COLS;
    var row = Math.floor(rayAnim.frame / SHEET_COLS) % SHEET_ROWS;
    var sx = col * frameW, sy = row * frameH;

    var wobble = confused ? Math.sin(t * 0.02) * 5 : 0;

    ctx.save();
    if (rayAnim.facing < 0){
      ctx.translate(rayX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-rayX, 0);
    }
    if (confused){
      ctx.filter = "hue-rotate(140deg) saturate(1.8)";
    }
    if (starred){
      ctx.shadowColor = "rgba(240,180,41,0.95)";
      ctx.shadowBlur = 18 + Math.sin(t * 0.02) * 6;
    }
    ctx.drawImage(raySheetImg, sx, sy, frameW, frameH, left + wobble, top, dims.w, dims.h);
    ctx.restore();

    if (confused) drawConfusionEffect(t, dims);
  }

  function drawCursedAura(it){
    var pulse = 0.75 + 0.25 * Math.sin(it.age * 6);
    var glowR = ITEM_BOX * 1.7 * pulse;

    // big pulsing dark-magic halo behind the candy
    ctx.save();
    var grad = ctx.createRadialGradient(it.x, it.y, 4, it.x, it.y, glowR);
    grad.addColorStop(0, "rgba(80,25,110,0.85)");
    grad.addColorStop(0.45, "rgba(60,20,90,0.55)");
    grad.addColorStop(1, "rgba(60,20,90,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(it.x, it.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // thick rising smoke plume — lots of overlapping puffs
    var wispCount = 9;
    for (var w = 0; w < wispCount; w++){
      var wt = (it.age * 0.9 + w / wispCount) % 1;
      var driftX = Math.sin(it.age * 2.6 + w * 1.9) * 16;
      var wx = it.x + driftX * wt;
      var wy = it.y - wt * 85;
      var wr = (1 - wt * 0.7) * 15 + 3;
      ctx.save();
      ctx.globalAlpha = (1 - wt) * 0.65;
      ctx.fillStyle = w % 3 === 0 ? "#6FA85A" : (w % 2 === 0 ? "#4B2E5C" : "#1B1230");
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // low creeping fog pooling at its base
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(it.age * 7);
    ctx.fillStyle = "#3D2A5C";
    ctx.beginPath();
    ctx.ellipse(it.x, it.y + 10, glowR * 0.5, glowR * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawItem(it){
    var entry = ITEM_IMAGES[it.type.key];
    if (!entry || !entry.ready) return;
    if (it.type.key === "cursed") drawCursedAura(it);
    var iw = entry.img.naturalWidth, ih = entry.img.naturalHeight;
    var scale = (ITEM_BOX * it.sizeMul) / Math.max(iw, ih);
    var w = iw * scale, h = ih * scale;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot * 0.12);
    ctx.drawImage(entry.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawPopups(){
    popups.forEach(function(p){
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / 0.8);
      ctx.font = "700 15px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - p.t * 40);
      ctx.restore();
    });
  }

  // ---------- loop ----------
  function update(dt){
    if (state !== "playing") return;

    var prevRayX = rayX;
    var reversed = reverseTimer > 0;
    var speedMult = starBuffTimer > 0 ? STAR_SPEED_MULT : 1;
    var step = MOVE_SPEED * speedMult * dt;
    if (dragging){
      var dragTarget = reversed ? (LOGICAL_W - rayTargetX) : rayTargetX;
      var diff = dragTarget - rayX;
      if (Math.abs(diff) <= step) rayX = dragTarget;
      else rayX += (diff > 0 ? 1 : -1) * step;
    } else {
      var vx = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
      if (reversed) vx *= -1;
      rayX += vx * step;
    }
    rayX = Math.max(RAY_R, Math.min(LOGICAL_W - RAY_R, rayX));

    var moveDelta = rayX - prevRayX;
    if (Math.abs(moveDelta) > 0.3){
      if (moveDelta < 0) rayAnim.facing = -1;
      else if (moveDelta > 0) rayAnim.facing = 1;
      rayAnim.timer += dt;
      var frameDur = 1 / rayAnim.fps;
      while (rayAnim.timer >= frameDur){
        rayAnim.timer -= frameDur;
        rayAnim.frame = (rayAnim.frame + 1) % SHEET_FRAMES;
      }
    } else {
      rayAnim.frame = 0;
      rayAnim.timer = 0;
    }

    elapsed += dt;
    timeLeft -= dt;
    spawnTimer -= dt * 1000;
    if (spawnTimer <= 0) spawnItem();

    if (doubleScoreTimer > 0) doubleScoreTimer = Math.max(0, doubleScoreTimer - dt);
    if (reverseTimer > 0) reverseTimer = Math.max(0, reverseTimer - dt);
    if (shrinkTimer > 0) shrinkTimer = Math.max(0, shrinkTimer - dt);
    if (starBuffTimer > 0) starBuffTimer = Math.max(0, starBuffTimer - dt);
    raySizeScale = shrinkTimer > 0 ? SHRINK_SCALE : 1;

    var basket = getBasketPoint();
    var catchRadius = BASKET_CATCH_RADIUS * raySizeScale;

    for (var i = items.length - 1; i >= 0; i--){
      var it = items[i];
      it.age += dt;
      it.y += it.vy * dt;
      it.rot += it.vrot * dt;
      if (it.type.key === "cursed"){
        it.x += Math.sin(it.age * 5 + it.phase) * 60 * dt;
        it.x = Math.max(it.r + 4, Math.min(LOGICAL_W - it.r - 4, it.x));
      } else if (it.type.key === "bat"){
        var homingVX = (rayX - it.x) * 0.9;
        var flutterVX = Math.sin(it.age * 6 + it.phase) * 55;
        it.x += (homingVX + flutterVX) * dt;
        it.x = Math.max(it.r + 4, Math.min(LOGICAL_W - it.r - 4, it.x));
      }

      var dx = it.x - basket.x, dy = it.y - basket.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var caught = dist < (catchRadius * 0.7 + it.r);

      if (caught){
        items.splice(i, 1);
        if (it.type.good){
          streak++;
          var bonus = 0;
          if (streak > 0 && streak % 5 === 0){ bonus = 20; sfxCombo(); addPopup(it.x, it.y - 18, "コンボ +" + bonus + "!", "#F0B429"); }
          var mult = doubleScoreTimer > 0 ? 2 : 1;
          var gained = (it.type.score + bonus) * mult;
          score += gained;
          addPopup(it.x, it.y, "+" + gained, it.type.key === "star" ? "#F0B429" : "#FFFBF2");

          if (it.type.effect === "double"){
            doubleScoreTimer = it.type.effectSeconds;
            addPopup(it.x, it.y - 18, "ちばボーナス x2!", "#F0B429");
            sfxBonus();
          } else if (it.type.effect === "time"){
            timeLeft += it.type.effectValue;
            addPopup(it.x, it.y - 18, "+" + it.type.effectValue + "びょう", "#8FD9C4");
            sfxBonus();
          } else if (it.type.key === "star"){
            starBuffTimer = STAR_BUFF_SECONDS;
            addPopup(it.x, it.y - 18, "無敵タイム!", "#F0B429");
            sfxBonus();
          } else {
            sfxCatch();
          }
        } else if (starBuffTimer > 0){
          streak++;
          addPopup(it.x, it.y, "無敵!", "#F0B429");
          sfxCatch();
        } else {
          streak = 0;
          if (it.type.losesLife){
            lives--;
            addPopup(it.x, it.y, "-1", "#FF8FA3");
          } else {
            addPopup(it.x, it.y, "しまった!", "#C9A6E0");
          }
          sfxHit();

          if (it.type.effect === "shrink"){
            shrinkTimer = it.type.effectSeconds;
            addPopup(it.x, it.y - 18, "ちいさくなった!", "#B98CC9");
          } else if (it.type.effect === "reverse"){
            reverseTimer = it.type.effectSeconds;
            addPopup(it.x, it.y - 18, "そうさ はんてん!", "#C9A6E0");
          }

          updateHud();
          if (lives <= 0){ endGame(); return; }
        }
        updateHud();
        continue;
      }

      if (it.y > LOGICAL_H + 30) items.splice(i, 1);
    }

    for (var j = popups.length - 1; j >= 0; j--){
      popups[j].life -= dt;
      popups[j].t += dt;
      if (popups[j].life <= 0) popups.splice(j, 1);
    }

    if (timeLeft <= 0){ timeLeft = 0; updateHud(); endGame(); return; }
    updateHud();
  }

  function render(t){
    drawBackground(t);
    items.forEach(drawItem);
    drawRay(t);
    drawPopups();
  }

  function loop(ts){
    if (lastTs === null) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt);
    render(ts);
    requestAnimationFrame(loop);
  }

  updateHud();
  render(0);
  requestAnimationFrame(loop);
})();
