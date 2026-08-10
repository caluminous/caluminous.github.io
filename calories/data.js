/* Fuel — built-in food, activity and lift databases.
   Foods: [name, kcal, protein, carbs, fat] per 100g, then category, default serving grams, serving label. */
(function (G) {
  'use strict';

  const F = (name, kcal, p, c, f, cat, servG, servLabel) =>
    ({ name, kcal100: kcal, p100: p, c100: c, f100: f, cat, servG, servLabel });

  const FOODS = [
    // ---------- Meat & fish ----------
    F('Chicken breast, cooked',      165, 31,   0,   3.6, 'Meat & fish', 120, '1 breast'),
    F('Chicken thigh, cooked',       209, 26,   0,   11,  'Meat & fish',  90, '1 thigh'),
    F('Chicken, roast with skin',    239, 27,   0,   14,  'Meat & fish', 120, '1 portion'),
    F('Turkey breast, cooked',       135, 30,   0,   1,   'Meat & fish', 100, '1 portion'),
    F('Beef mince, 5% fat',          137, 21,   0,   5.5, 'Meat & fish', 125, '1 portion'),
    F('Beef mince, 20% fat',         254, 17,   0,   20,  'Meat & fish', 125, '1 portion'),
    F('Sirloin steak, cooked',       244, 27,   0,   15,  'Meat & fish', 200, '1 steak'),
    F('Pork chop, grilled',          231, 26,   0,   14,  'Meat & fish', 150, '1 chop'),
    F('Back bacon, grilled',         287, 25,   0,   21,  'Meat & fish',  25, '1 rasher'),
    F('Pork sausage, cooked',        294, 15,   10,  22,  'Meat & fish',  50, '1 sausage'),
    F('Ham, sliced',                 107, 18,   1.5, 3,   'Meat & fish',  30, '1 slice'),
    F('Salmon fillet, cooked',       208, 20,   0,   13,  'Meat & fish', 130, '1 fillet'),
    F('Tuna, tinned in water',       116, 26,   0,   1,   'Meat & fish', 100, '1 tin'),
    F('Cod fillet, cooked',           82, 18,   0,   0.7, 'Meat & fish', 150, '1 fillet'),
    F('Prawns, cooked',               99, 24,   0.2, 0.3, 'Meat & fish', 100, '1 portion'),
    F('Fish fingers, baked',         220, 12,   20,  10,  'Meat & fish',  28, '1 finger'),
    F('Lamb chop, grilled',          277, 25,   0,   20,  'Meat & fish', 120, '1 chop'),

    // ---------- Eggs & dairy ----------
    F('Egg, whole',                  143, 12.6, 0.7, 9.5, 'Eggs & dairy', 58, '1 large egg'),
    F('Egg white',                    52, 11,   0.7, 0.2, 'Eggs & dairy', 33, '1 white'),
    F('Milk, whole',                  64, 3.4,  4.7, 3.6, 'Eggs & dairy', 250, '1 glass'),
    F('Milk, semi-skimmed',           50, 3.6,  4.8, 1.8, 'Eggs & dairy', 250, '1 glass'),
    F('Milk, skimmed',                35, 3.5,  5,   0.1, 'Eggs & dairy', 250, '1 glass'),
    F('Oat milk',                     46, 0.3,  6.7, 1.5, 'Eggs & dairy', 250, '1 glass'),
    F('Almond milk, unsweetened',     13, 0.5,  0.1, 1.1, 'Eggs & dairy', 250, '1 glass'),
    F('Greek yoghurt, 0% fat',        57, 10,   4,   0.4, 'Eggs & dairy', 170, '1 pot'),
    F('Greek yoghurt, full fat',      97, 9,    3.6, 5,   'Eggs & dairy', 170, '1 pot'),
    F('Yoghurt, fruit',               95, 4,    15,  2,   'Eggs & dairy', 125, '1 pot'),
    F('Cheddar cheese',              416, 25,   0.1, 34.9,'Eggs & dairy',  30, '1 slice'),
    F('Mozzarella',                  280, 22,   2.2, 20,  'Eggs & dairy',  30, '1 portion'),
    F('Cottage cheese',               98, 11,   3.4, 4.3, 'Eggs & dairy', 100, '1 portion'),
    F('Cream cheese',                253, 6,    4,   24,  'Eggs & dairy',  30, '1 spread'),
    F('Butter',                      717, 0.9,  0.1, 81,  'Eggs & dairy',  10, '1 tsp'),
    F('Halloumi',                    321, 22,   2,   25,  'Eggs & dairy',  80, '1 portion'),
    F('Parmesan',                    431, 38,   4.1, 29,  'Eggs & dairy',  15, '1 sprinkle'),

    // ---------- Grains & starches ----------
    F('White rice, cooked',          130, 2.7,  28,  0.3, 'Grains & starch', 180, '1 portion'),
    F('Brown rice, cooked',          123, 2.7,  26,  1,   'Grains & starch', 180, '1 portion'),
    F('Pasta, cooked',               158, 5.8,  31,  0.9, 'Grains & starch', 200, '1 portion'),
    F('Wholewheat pasta, cooked',    149, 6,    30,  1.3, 'Grains & starch', 200, '1 portion'),
    F('White bread',                 265, 9,    49,  3.2, 'Grains & starch',  40, '1 slice'),
    F('Wholemeal bread',             247, 10.5, 41,  3.5, 'Grains & starch',  40, '1 slice'),
    F('Bagel',                       275, 11,   53,  1.5, 'Grains & starch',  85, '1 bagel'),
    F('Tortilla wrap',               297, 8,    49,  7,   'Grains & starch',  62, '1 wrap'),
    F('Pitta bread',                 275, 9,    55,  1.2, 'Grains & starch',  60, '1 pitta'),
    F('Naan bread',                  310, 9,    50,  8,   'Grains & starch',  90, '1 naan'),
    F('Potato, boiled',               87, 2,    20,  0.1, 'Grains & starch', 200, '1 portion'),
    F('Jacket potato, baked',         93, 2.5,  21,  0.1, 'Grains & starch', 250, '1 potato'),
    F('Oven chips',                  162, 2.5,  25,  5.5, 'Grains & starch', 150, '1 portion'),
    F('Chips, takeaway',             312, 4,    39,  15,  'Grains & starch', 200, '1 portion'),
    F('Sweet potato, baked',          90, 2,    21,  0.2, 'Grains & starch', 180, '1 potato'),
    F('Porridge oats, dry',          379, 13.2, 67,  6.5, 'Grains & starch',  40, '1 serving'),
    F('Weetabix',                    362, 11.5, 69,  2,   'Grains & starch',  38, '2 biscuits'),
    F('Cornflakes',                  378, 7,    84,  0.9, 'Grains & starch',  30, '1 bowl'),
    F('Granola',                     471, 10,   64,  20,  'Grains & starch',  45, '1 serving'),
    F('Couscous, cooked',            112, 3.8,  23,  0.2, 'Grains & starch', 180, '1 portion'),
    F('Quinoa, cooked',              120, 4.4,  21,  1.9, 'Grains & starch', 180, '1 portion'),
    F('Noodles, egg, cooked',        138, 4.5,  25,  2.1, 'Grains & starch', 200, '1 portion'),

    // ---------- Fruit & veg ----------
    F('Banana',                       89, 1.1,  23,  0.3, 'Fruit & veg', 120, '1 medium'),
    F('Apple',                        52, 0.3,  14,  0.2, 'Fruit & veg', 150, '1 medium'),
    F('Orange',                       47, 0.9,  12,  0.1, 'Fruit & veg', 130, '1 medium'),
    F('Strawberries',                 32, 0.7,  7.7, 0.3, 'Fruit & veg', 100, '1 handful'),
    F('Blueberries',                  57, 0.7,  14,  0.3, 'Fruit & veg',  80, '1 handful'),
    F('Grapes',                       69, 0.7,  18,  0.2, 'Fruit & veg', 100, '1 handful'),
    F('Avocado',                     160, 2,    8.5, 15,  'Fruit & veg', 100, '1/2 avocado'),
    F('Pineapple',                    50, 0.5,  13,  0.1, 'Fruit & veg', 120, '1 portion'),
    F('Mango',                        60, 0.8,  15,  0.4, 'Fruit & veg', 150, '1 portion'),
    F('Broccoli',                     34, 2.8,  7,   0.4, 'Fruit & veg',  80, '1 portion'),
    F('Carrots',                      41, 0.9,  10,  0.2, 'Fruit & veg',  80, '1 portion'),
    F('Peas',                         81, 5.4,  14,  0.4, 'Fruit & veg',  80, '1 portion'),
    F('Spinach',                      23, 2.9,  3.6, 0.4, 'Fruit & veg',  80, '1 portion'),
    F('Tomato',                       18, 0.9,  3.9, 0.2, 'Fruit & veg',  85, '1 medium'),
    F('Cucumber',                     15, 0.7,  3.6, 0.1, 'Fruit & veg',  50, '1 portion'),
    F('Sweetcorn',                    86, 3.2,  19,  1.2, 'Fruit & veg',  80, '1 portion'),
    F('Mushrooms',                    22, 3.1,  3.3, 0.3, 'Fruit & veg',  80, '1 portion'),
    F('Onion',                        40, 1.1,  9,   0.1, 'Fruit & veg',  60, '1 medium'),
    F('Baked beans',                  78, 4.8,  13,  0.4, 'Fruit & veg', 200, '1/2 tin'),
    F('Mixed salad',                  17, 1.4,  2.9, 0.2, 'Fruit & veg',  80, '1 bowl'),

    // ---------- Nuts, fats & spreads ----------
    F('Peanut butter',               588, 25,   20,  50,  'Nuts & fats',  20, '1 tbsp'),
    F('Almonds',                     579, 21,   22,  50,  'Nuts & fats',  30, '1 handful'),
    F('Cashews',                     553, 18,   30,  44,  'Nuts & fats',  30, '1 handful'),
    F('Walnuts',                     654, 15,   14,  65,  'Nuts & fats',  30, '1 handful'),
    F('Olive oil',                   884, 0,    0,   100, 'Nuts & fats',  14, '1 tbsp'),
    F('Mayonnaise',                  680, 1,    1.3, 75,  'Nuts & fats',  15, '1 tbsp'),
    F('Ketchup',                     102, 1.2,  25,  0.1, 'Nuts & fats',  15, '1 tbsp'),
    F('Honey',                       304, 0.3,  82,  0,   'Nuts & fats',  20, '1 tbsp'),
    F('Jam',                         278, 0.4,  69,  0.1, 'Nuts & fats',  20, '1 tbsp'),
    F('Chocolate spread',            539, 6,    57,  31,  'Nuts & fats',  20, '1 tbsp'),

    // ---------- Legumes & veggie protein ----------
    F('Chickpeas, tinned',           139, 7.1,  22,  2.6, 'Veggie protein', 120, '1 portion'),
    F('Lentils, cooked',             116, 9,    20,  0.4, 'Veggie protein', 150, '1 portion'),
    F('Kidney beans, tinned',        100, 6.9,  17,  0.5, 'Veggie protein', 120, '1 portion'),
    F('Tofu, firm',                  144, 17,   2.8, 8.7, 'Veggie protein', 100, '1 portion'),
    F('Quorn mince',                 105, 14.5, 4.5, 2,   'Veggie protein', 100, '1 portion'),
    F('Hummus',                      306, 7.5,  12,  25,  'Veggie protein',  50, '1 portion'),

    // ---------- Supplements ----------
    F('Whey protein powder',         380, 78,   8,   5,   'Supplements',  30, '1 scoop'),
    F('Protein bar',                 350, 32,   35,  8,   'Supplements',  60, '1 bar'),
    F('Protein shake, ready to drink',45, 8,    2,   0.5, 'Supplements', 330, '1 bottle'),
    F('Creatine monohydrate',          0, 0,    0,   0,   'Supplements',   5, '1 scoop'),

    // ---------- Snacks & treats ----------
    F('Milk chocolate',              535, 7.6,  59,  30,  'Snacks',  45, '1 bar'),
    F('Crisps',                      536, 6.6,  53,  33,  'Snacks',  25, '1 bag'),
    F('Digestive biscuit',           471, 6.5,  63,  21,  'Snacks',  15, '1 biscuit'),
    F('Cookie',                      480, 5.5,  62,  23,  'Snacks',  40, '1 cookie'),
    F('Ice cream',                   207, 3.5,  24,  11,  'Snacks', 100, '1 scoop'),
    F('Sponge cake',                 350, 5,    50,  14,  'Snacks',  80, '1 slice'),
    F('Doughnut',                    403, 6,    47,  21,  'Snacks',  70, '1 doughnut'),
    F('Croissant',                   406, 8,    46,  21,  'Snacks',  60, '1 croissant'),
    F('Flapjack',                    450, 5,    60,  21,  'Snacks',  60, '1 flapjack'),
    F('Sweet popcorn',               480, 6,    63,  22,  'Snacks',  30, '1 bag'),
    F('Haribo sweets',               344, 6.9,  77,  0.5, 'Snacks',  50, '1 bag'),
    F('Cereal bar',                  400, 5,    68,  12,  'Snacks',  35, '1 bar'),

    // ---------- Drinks ----------
    F('Coca-Cola',                    42, 0,    10.6,0,   'Drinks', 330, '1 can'),
    F('Diet cola',                     0.4,0,   0,   0,   'Drinks', 330, '1 can'),
    F('Orange juice',                 45, 0.7,  10.4,0.2, 'Drinks', 250, '1 glass'),
    F('Lager, 4.5%',                  43, 0.5,  3.5, 0,   'Drinks', 568, '1 pint'),
    F('Red wine',                     85, 0.1,  2.6, 0,   'Drinks', 175, '1 glass'),
    F('Vodka, 40%',                  231, 0,    0,   0,   'Drinks',  25, '1 shot'),
    F('Latte, semi-skimmed',          55, 3.2,  5,   2,   'Drinks', 350, '1 medium'),
    F('Black coffee',                  2, 0.1,  0,   0,   'Drinks', 250, '1 mug'),
    F('Tea with milk',                13, 0.7,  1,   0.6, 'Drinks', 250, '1 mug'),
    F('Energy drink',                 45, 0,    11,  0,   'Drinks', 250, '1 can'),
    F('Squash, diluted',               4, 0,    1,   0,   'Drinks', 250, '1 glass'),

    // ---------- Meals & takeaway ----------
    F('Pizza, margherita',           266, 11,   33,  10,  'Meals', 300, '1/2 pizza'),
    F('Cheeseburger, fast food',     257, 13,   20,  14,  'Meals', 219, '1 burger'),
    F('Chicken curry, takeaway',     145, 9,    8,   9,   'Meals', 400, '1 portion'),
    F('Salmon sushi roll',           145, 6,    26,  2,   'Meals', 200, '1 pack'),
    F('Doner kebab',                 215, 15,   12,  12,  'Meals', 300, '1 kebab'),
    F('Egg fried rice',              163, 5,    25,  5,   'Meals', 300, '1 portion'),
    F('Chicken nuggets',             296, 15,   18,  18,  'Meals', 100, '6 pieces'),
    F('Full English breakfast',      200, 12,   12,  12,  'Meals', 450, '1 plate'),
    F('Chicken salad sandwich',      195, 12,   22,  6,   'Meals', 200, '1 sandwich'),
    F('Tomato soup',                  60, 1.5,  8,   2.5, 'Meals', 400, '1 tin'),
    F('Lasagne',                     135, 7.5,  12,  6,   'Meals', 400, '1 portion'),
    F("Shepherd's pie",              120, 6,    12,  5,   'Meals', 400, '1 portion'),
    F('Stir fry with chicken',       125, 11,   10,  4.5, 'Meals', 400, '1 portion'),
    F('Chilli con carne',            130, 9,    10,  6,   'Meals', 400, '1 portion')
  ];

  FOODS.forEach((f, i) => { f.ref = 'b:' + i; f.src = 'built-in'; });

  /* MET values — kcal/min = MET * 3.5 * kg / 200 */
  const ACTIVITIES = [
    { name: 'Walking, slow',            met: 2.8,  cat: 'Cardio' },
    { name: 'Walking, brisk',           met: 4.3,  cat: 'Cardio' },
    { name: 'Hiking',                   met: 6.0,  cat: 'Cardio' },
    { name: 'Jogging, 8 km/h',          met: 8.3,  cat: 'Cardio' },
    { name: 'Running, 10 km/h',         met: 9.8,  cat: 'Cardio' },
    { name: 'Running, 12 km/h',         met: 11.5, cat: 'Cardio' },
    { name: 'Running, 14+ km/h',        met: 13.5, cat: 'Cardio' },
    { name: 'Cycling, leisure',         met: 6.0,  cat: 'Cardio' },
    { name: 'Cycling, moderate',        met: 8.0,  cat: 'Cardio' },
    { name: 'Cycling, fast',            met: 10.0, cat: 'Cardio' },
    { name: 'Swimming, leisure',        met: 6.0,  cat: 'Cardio' },
    { name: 'Swimming, laps',           met: 9.8,  cat: 'Cardio' },
    { name: 'Rowing machine',           met: 7.0,  cat: 'Cardio' },
    { name: 'Rowing, hard',             met: 8.5,  cat: 'Cardio' },
    { name: 'Cross trainer',            met: 5.0,  cat: 'Cardio' },
    { name: 'Stair climber',            met: 9.0,  cat: 'Cardio' },
    { name: 'Skipping rope',            met: 11.0, cat: 'Cardio' },
    { name: 'Weight training, moderate',met: 3.5,  cat: 'Gym' },
    { name: 'Weight training, hard',    met: 6.0,  cat: 'Gym' },
    { name: 'Circuit training',         met: 8.0,  cat: 'Gym' },
    { name: 'HIIT',                     met: 8.0,  cat: 'Gym' },
    { name: 'Yoga',                     met: 3.0,  cat: 'Gym' },
    { name: 'Pilates',                  met: 3.0,  cat: 'Gym' },
    { name: 'Stretching',               met: 2.3,  cat: 'Gym' },
    { name: 'Football',                 met: 7.0,  cat: 'Sport' },
    { name: 'Football, kickabout',      met: 5.0,  cat: 'Sport' },
    { name: 'Basketball',               met: 6.5,  cat: 'Sport' },
    { name: 'Tennis',                   met: 7.3,  cat: 'Sport' },
    { name: 'Badminton',                met: 5.5,  cat: 'Sport' },
    { name: 'Squash',                   met: 12.0, cat: 'Sport' },
    { name: 'Rugby',                    met: 8.3,  cat: 'Sport' },
    { name: 'Cricket',                  met: 4.8,  cat: 'Sport' },
    { name: 'Golf, walking',            met: 4.8,  cat: 'Sport' },
    { name: 'Boxing, bag work',         met: 5.5,  cat: 'Sport' },
    { name: 'Boxing, sparring',         met: 7.8,  cat: 'Sport' },
    { name: 'Martial arts',             met: 10.3, cat: 'Sport' },
    { name: 'Climbing',                 met: 8.0,  cat: 'Sport' },
    { name: 'Skateboarding',            met: 5.0,  cat: 'Sport' },
    { name: 'Dancing',                  met: 5.0,  cat: 'Sport' },
    { name: 'Housework',                met: 3.0,  cat: 'Daily' },
    { name: 'Gardening',                met: 3.8,  cat: 'Daily' },
    { name: 'Manual labour',            met: 5.5,  cat: 'Daily' }
  ];
  ACTIVITIES.forEach((a, i) => { a.ref = 'a:' + i; });

  const LIFTS = [
    'Bench Press', 'Incline Bench Press', 'Dumbbell Bench Press', 'Chest Fly', 'Push Up', 'Dip',
    'Squat', 'Front Squat', 'Leg Press', 'Lunge', 'Bulgarian Split Squat', 'Leg Extension',
    'Leg Curl', 'Romanian Deadlift', 'Deadlift', 'Hip Thrust', 'Calf Raise',
    'Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Rear Delt Fly', 'Shrug',
    'Pull Up', 'Chin Up', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Seated Cable Row', 'Face Pull',
    'Bicep Curl', 'Hammer Curl', 'Preacher Curl', 'Tricep Pushdown', 'Skullcrusher', 'Tricep Extension',
    'Plank', 'Crunch', 'Leg Raise', 'Russian Twist', 'Cable Woodchop'
  ];

  G.DB = { FOODS, ACTIVITIES, LIFTS };
})(window);
