/* Fuel — energy, macro and body maths. Pure functions, no state. */
(function (G) {
  'use strict';

  const KCAL_PER_KG_FAT = 7700;   // approx energy in 1 kg of body tissue
  const KCAL_P = 4, KCAL_C = 4, KCAL_F = 9;

  const ACTIVITY_LEVELS = [
    { v: 1.2,   label: 'Sedentary',    desc: 'Desk job, little or no exercise' },
    { v: 1.375, label: 'Light',        desc: 'Light exercise 1–3 days a week' },
    { v: 1.55,  label: 'Moderate',     desc: 'Moderate exercise 3–5 days a week' },
    { v: 1.725, label: 'Very active',  desc: 'Hard exercise 6–7 days a week' },
    { v: 1.9,   label: 'Athlete',      desc: 'Twice a day, or a physical job' }
  ];

  /* Mifflin-St Jeor — the most accurate general-population BMR equation. */
  function bmr(profile, weightKg) {
    const { sex, age, heightCm } = profile;
    if (!weightKg || !heightCm || !age) return 0;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (sex === 'female') return base - 161;
    if (sex === 'other')  return base - 78;   // midpoint of the two constants
    return base + 5;
  }

  /* Maintenance calories: BMR scaled by how much you move outside of logged exercise. */
  function tdee(profile, weightKg) {
    return bmr(profile, weightKg) * (profile.activity || 1.2);
  }

  /* Daily energy shift implied by a target rate of weight change (kg/week). */
  function dailyAdjustment(profile) {
    const rate = Math.abs(profile.rateKgWeek || 0);
    const perDay = (rate * KCAL_PER_KG_FAT) / 7;
    if (profile.goalType === 'lose') return -perDay;
    if (profile.goalType === 'gain') return  perDay;
    return 0;
  }

  /* The daily calorie target. Never recommends below a safe floor. */
  function calorieTarget(profile, weightKg) {
    if (profile.calorieMode === 'manual') return Math.round(profile.manualCalories || 2000);
    const maint = tdee(profile, weightKg);
    if (!maint) return Math.round(profile.manualCalories || 2000);
    const floor = profile.sex === 'female' ? 1200 : 1500;
    return Math.round(Math.max(floor, maint + dailyAdjustment(profile)));
  }

  /* Protein target in grams. */
  function proteinTarget(profile, weightKg, kcalTarget) {
    if (profile.proteinMode === 'manual') return Math.round(profile.manualProtein || 0);
    if (profile.proteinMode === 'percent') {
      return Math.round((kcalTarget * (profile.proteinPercent || 30) / 100) / KCAL_P);
    }
    return Math.round((profile.proteinGkg || 1.8) * (weightKg || 70));
  }

  /* Fat from a % of total calories, carbs take whatever energy is left. */
  function macroTargets(profile, weightKg) {
    const kcal = calorieTarget(profile, weightKg);
    const protein = proteinTarget(profile, weightKg, kcal);
    const fat = Math.round((kcal * (profile.fatPercent || 27) / 100) / KCAL_F);
    const carbKcal = kcal - protein * KCAL_P - fat * KCAL_F;
    const carbs = Math.max(0, Math.round(carbKcal / KCAL_C));
    return { kcal, protein, carbs, fat };
  }

  /* Calories burned by an activity, from its MET value. */
  function activityKcal(met, minutes, weightKg) {
    if (!met || !minutes || !weightKg) return 0;
    return Math.round(met * 3.5 * weightKg / 200 * minutes);
  }

  /* Estimated one-rep max — Epley formula, capped where it stops being meaningful. */
  function e1rm(weight, reps) {
    if (!weight || !reps) return 0;
    if (reps === 1) return weight;
    if (reps > 12) return Math.round(weight * (1 + 12 / 30) * 10) / 10;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
  }

  function bmi(weightKg, heightCm) {
    if (!weightKg || !heightCm) return 0;
    return Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10;
  }

  function bmiBand(v) {
    if (!v) return { label: '—', tone: 'mute' };
    if (v < 18.5) return { label: 'Underweight', tone: 'warn' };
    if (v < 25)   return { label: 'Healthy',     tone: 'ok' };
    if (v < 30)   return { label: 'Overweight',  tone: 'warn' };
    return { label: 'Obese', tone: 'bad' };
  }

  /* Least-squares slope of weight over time, in kg per week.
     Returns null when there is not enough spread in the data to mean anything. */
  function weightTrend(entries) {
    if (!entries || entries.length < 2) return null;
    const pts = entries.map(e => ({ x: G.Util.dayNumber(e.d), y: e.kg }));
    const spanDays = pts[pts.length - 1].x - pts[0].x;
    if (spanDays < 3) return null;
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let num = 0, den = 0;
    for (const p of pts) { num += (p.x - mx) * (p.y - my); den += Math.pow(p.x - mx, 2); }
    if (den === 0) return null;
    return (num / den) * 7;   // kg per week
  }

  /* Weeks until goal weight at the current measured rate. */
  function projection(currentKg, goalKg, kgPerWeek) {
    if (!currentKg || !goalKg || !kgPerWeek) return null;
    const delta = goalKg - currentKg;
    if (Math.abs(delta) < 0.2) return { weeks: 0, date: new Date(), reached: true };
    if (Math.sign(delta) !== Math.sign(kgPerWeek)) return null;  // moving the wrong way
    const weeks = delta / kgPerWeek;
    if (weeks > 260) return null;                                 // beyond 5 years, not useful
    const date = new Date();
    date.setDate(date.getDate() + Math.round(weeks * 7));
    return { weeks: Math.round(weeks * 10) / 10, date, reached: false };
  }

  /* Simple centred moving average for smoothing a noisy weight series. */
  function movingAverage(values, window) {
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const from = Math.max(0, i - window + 1);
      const slice = values.slice(from, i + 1);
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return out;
  }

  G.Calc = {
    KCAL_PER_KG_FAT, KCAL_P, KCAL_C, KCAL_F, ACTIVITY_LEVELS,
    bmr, tdee, dailyAdjustment, calorieTarget, proteinTarget, macroTargets,
    activityKcal, e1rm, bmi, bmiBand, weightTrend, projection, movingAverage
  };
})(window);
