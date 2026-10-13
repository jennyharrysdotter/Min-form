// Min Form service worker.
// Appens filer sparas för att fungera utan internet. Användarens data ligger
// i webbläsarens lokala lagring och påverkas aldrig av den här filen.
const CACHE = "minform-app-3.11";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./exercise-info.js", "./exercise-info-2.js", "./livsmedel.js",
  "./img/Band_Assisted_Pull-Up/0.webp",
  "./img/Band_Assisted_Pull-Up/1.webp",
  "./img/Barbell_Bench_Press_-_Medium_Grip/0.webp",
  "./img/Barbell_Bench_Press_-_Medium_Grip/1.webp",
  "./img/Barbell_Deadlift/0.webp",
  "./img/Barbell_Deadlift/1.webp",
  "./img/Barbell_Full_Squat/0.webp",
  "./img/Barbell_Full_Squat/1.webp",
  "./img/Barbell_Hip_Thrust/0.webp",
  "./img/Barbell_Hip_Thrust/1.webp",
  "./img/Bent_Over_Barbell_Row/0.webp",
  "./img/Bent_Over_Barbell_Row/1.webp",
  "./img/Cable_Rope_Overhead_Triceps_Extension/0.webp",
  "./img/Cable_Rope_Overhead_Triceps_Extension/1.webp",
  "./img/Chin-Up/0.webp",
  "./img/Chin-Up/1.webp",
  "./img/Dumbbell_Bench_Press/0.webp",
  "./img/Dumbbell_Bench_Press/1.webp",
  "./img/Dumbbell_Bicep_Curl/0.webp",
  "./img/Dumbbell_Bicep_Curl/1.webp",
  "./img/Dumbbell_Rear_Lunge/0.webp",
  "./img/Dumbbell_Rear_Lunge/1.webp",
  "./img/Dumbbell_Shoulder_Press/0.webp",
  "./img/Dumbbell_Shoulder_Press/1.webp",
  "./img/Face_Pull/0.webp",
  "./img/Face_Pull/1.webp",
  "./img/Front_Barbell_Squat/0.webp",
  "./img/Front_Barbell_Squat/1.webp",
  "./img/Goblet_Squat/0.webp",
  "./img/Goblet_Squat/1.webp",
  "./img/Hack_Squat/0.webp",
  "./img/Hack_Squat/1.webp",
  "./img/Hammer_Curls/0.webp",
  "./img/Hammer_Curls/1.webp",
  "./img/Hanging_Leg_Raise/0.webp",
  "./img/Hanging_Leg_Raise/1.webp",
  "./img/Hyperextensions_Back_Extensions/0.webp",
  "./img/Hyperextensions_Back_Extensions/1.webp",
  "./img/Incline_Dumbbell_Press/0.webp",
  "./img/Incline_Dumbbell_Press/1.webp",
  "./img/Leg_Press/0.webp",
  "./img/Leg_Press/1.webp",
  "./img/Leverage_Chest_Press/0.webp",
  "./img/Leverage_Chest_Press/1.webp",
  "./img/Lying_Leg_Curls/0.webp",
  "./img/Lying_Leg_Curls/1.webp",
  "./img/Lying_T-Bar_Row/0.webp",
  "./img/Lying_T-Bar_Row/1.webp",
  "./img/One-Arm_Dumbbell_Row/0.webp",
  "./img/One-Arm_Dumbbell_Row/1.webp",
  "./img/Pallof_Press/0.webp",
  "./img/Pallof_Press/1.webp",
  "./img/Plank/0.webp",
  "./img/Plank/1.webp",
  "./img/Pushups/0.webp",
  "./img/Pushups/1.webp",
  "./img/Reverse_Machine_Flyes/0.webp",
  "./img/Reverse_Machine_Flyes/1.webp",
  "./img/Romanian_Deadlift/0.webp",
  "./img/Romanian_Deadlift/1.webp",
  "./img/Seated_Cable_Rows/0.webp",
  "./img/Seated_Cable_Rows/1.webp",
  "./img/Seated_Leg_Curl/0.webp",
  "./img/Seated_Leg_Curl/1.webp",
  "./img/Side_Bridge/0.webp",
  "./img/Side_Bridge/1.webp",
  "./img/Side_Lateral_Raise/0.webp",
  "./img/Side_Lateral_Raise/1.webp",
  "./img/Standing_Leg_Curl/0.webp",
  "./img/Standing_Leg_Curl/1.webp",
  "./img/Standing_Military_Press/0.webp",
  "./img/Standing_Military_Press/1.webp",
  "./img/Triceps_Pushdown/0.webp",
  "./img/Triceps_Pushdown/1.webp",
  "./img/Wide-Grip_Lat_Pulldown/0.webp",
  "./img/Wide-Grip_Lat_Pulldown/1.webp"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("minform-app-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nätverket först så att uppdateringar kommer direkt, sparad kopia om du är offline.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});
