// The body heat map's figures (#85; spec #80, Look): simple front and back
// outlines drawn for Forge, blocky in the Slab manner, one shape per muscle
// group per view (both sides of a paired one), with outlined neutral shapes
// (head, neck, hands, pelvis, knees, feet) so they read as a body. The
// whole drawing lives here, apart from the card, so it can be reviewed and
// redrawn on its own.
//
// Each figure is drawn in its own BOX, from its left half: a shape marked
// `pair` is mirrored across the centre line onto the right half.

/** @import { MuscleGroup } from "../core/types.js" */

/** @typedef {[number, number][]} Points */

/**
 * One muscle group's shape on a figure.
 * @typedef {object} MuscleShape
 * @property {MuscleGroup} muscleGroup
 * @property {Points} points the left half's, or the whole of a centre one
 * @property {boolean} pair whether it's mirrored onto the right
 */

/**
 * @typedef {object} Figure
 * @property {string} name
 * @property {number} offset where its box starts across the card
 * @property {MuscleShape[]} shapes drawn in order; later ones sit on top
 * @property {Points[]} neutral the left halves of shapes that aren't muscle
 *   groups, mirrored too
 */

// A figure's box: its width, height and centre line.
export const BOX = { width: 160, height: 310, centre: 80 };

// The head and neck, on the centre line.
export const HEAD = { cy: 20, r: 15 };
export const NECK = { width: 12, top: 34, height: 8 };

// Shared by both views.
const HANDS = /** @type {Points} */ ([
  [34, 156],
  [46, 156],
  [46, 168],
  [36, 168],
]);
const FEET = /** @type {Points} */ ([
  [56, 292],
  [72, 292],
  [74, 302],
  [52, 302],
]);
const SIDE_DELTS = /** @type {Points} */ ([
  [32, 60],
  [44, 54],
  [46, 80],
  [34, 82],
]);
const UPPER_ARM = /** @type {Points} */ ([
  [34, 86],
  [46, 84],
  [48, 112],
  [36, 114],
]);
const FOREARMS = /** @type {Points} */ ([
  [32, 118],
  [48, 116],
  [46, 152],
  [36, 152],
]);

/** @type {Figure[]} */
export const FIGURES = [
  {
    name: "Front",
    offset: 10,
    neutral: [
      HANDS,
      FEET,
      // Pelvis, knees.
      [
        [56, 144],
        [80, 144],
        [80, 160],
        [62, 160],
      ],
      [
        [56, 226],
        [72, 226],
        [72, 236],
        [56, 236],
      ],
    ],
    shapes: [
      {
        muscleGroup: "traps",
        pair: true,
        points: [
          [66, 42],
          [77, 40],
          [77, 48],
          [54, 54],
        ],
      },
      { muscleGroup: "side-delts", pair: true, points: SIDE_DELTS },
      {
        muscleGroup: "front-delts",
        pair: true,
        points: [
          [44, 54],
          [58, 52],
          [60, 70],
          [46, 80],
        ],
      },
      {
        muscleGroup: "chest",
        pair: true,
        points: [
          [60, 54],
          [78, 54],
          [78, 84],
          [62, 88],
          [60, 70],
        ],
      },
      { muscleGroup: "biceps", pair: true, points: UPPER_ARM },
      { muscleGroup: "forearms", pair: true, points: FOREARMS },
      {
        muscleGroup: "abs",
        pair: false,
        points: [
          [66, 92],
          [94, 92],
          [92, 140],
          [68, 140],
        ],
      },
      {
        muscleGroup: "obliques",
        pair: true,
        points: [
          [52, 94],
          [62, 92],
          [65, 138],
          [56, 134],
          [50, 116],
        ],
      },
      {
        muscleGroup: "quads",
        pair: true,
        points: [
          [52, 162],
          [71, 162],
          [73, 208],
          [64, 222],
          [54, 212],
          [50, 186],
        ],
      },
      {
        muscleGroup: "adductors",
        pair: true,
        points: [
          [73, 162],
          [79, 162],
          [79, 198],
          [75, 206],
        ],
      },
      {
        muscleGroup: "calves",
        pair: true,
        points: [
          [54, 238],
          [72, 238],
          [70, 288],
          [58, 288],
        ],
      },
    ],
  },
  {
    name: "Back",
    offset: 188,
    neutral: [
      HANDS,
      FEET,
      [
        [56, 226],
        [72, 226],
        [72, 236],
        [56, 236],
      ],
    ],
    shapes: [
      {
        muscleGroup: "lats-upper-back",
        pair: true,
        points: [
          [52, 80],
          [60, 68],
          [68, 88],
          [78, 98],
          [78, 126],
          [64, 122],
          [54, 100],
        ],
      },
      {
        muscleGroup: "traps",
        pair: false,
        points: [
          [80, 40],
          [100, 52],
          [93, 84],
          [80, 94],
          [67, 84],
          [60, 52],
        ],
      },
      { muscleGroup: "side-delts", pair: true, points: SIDE_DELTS },
      {
        muscleGroup: "rear-delts",
        pair: true,
        points: [
          [44, 54],
          [58, 54],
          [58, 66],
          [46, 80],
        ],
      },
      { muscleGroup: "triceps", pair: true, points: UPPER_ARM },
      { muscleGroup: "forearms", pair: true, points: FOREARMS },
      {
        muscleGroup: "lower-back",
        pair: false,
        points: [
          [66, 130],
          [94, 130],
          [92, 144],
          [68, 144],
        ],
      },
      {
        muscleGroup: "glutes",
        pair: true,
        points: [
          [56, 147],
          [79, 147],
          [79, 176],
          [60, 178],
          [54, 162],
        ],
      },
      {
        muscleGroup: "hamstrings",
        pair: true,
        points: [
          [52, 180],
          [78, 180],
          [76, 220],
          [64, 224],
          [54, 214],
        ],
      },
      {
        muscleGroup: "calves",
        pair: true,
        points: [
          [52, 238],
          [72, 238],
          [70, 270],
          [62, 290],
          [56, 280],
        ],
      },
    ],
  },
];

/**
 * A shape's points on the card: moved to its figure's box, and mirrored
 * across the centre line for a pair's right half.
 * @param {Points} points
 * @param {number} offset
 * @param {boolean} [mirrored]
 * @returns {Points}
 */
export const placed = (points, offset, mirrored = false) =>
  points.map(([x, y]) => [offset + (mirrored ? 2 * BOX.centre - x : x), y]);
