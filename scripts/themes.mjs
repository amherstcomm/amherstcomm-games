// Curated themes for Weave (Strands-style) puzzle generation.
// Each theme: a clue shown to the player, a spangram (may be a joined
// compound, NYT-style), and a pool of common single-word members the
// generator draws from. Members: lowercase a-z, 4-10 letters.
export const THEMES = [
  {
    clue: 'Best in show',
    spangram: 'dogbreeds',
    words: ['poodle', 'beagle', 'boxer', 'husky', 'collie', 'corgi', 'terrier', 'spaniel', 'dalmatian', 'pointer', 'whippet', 'mastiff', 'setter', 'pug'],
  },
  {
    clue: 'Fresh from the garden',
    spangram: 'vegetables',
    words: ['carrot', 'potato', 'onion', 'radish', 'celery', 'spinach', 'turnip', 'pepper', 'lettuce', 'cabbage', 'squash', 'beet', 'kale', 'leek', 'pea'],
  },
  {
    clue: 'In the fruit bowl',
    spangram: 'fruitsalad',
    words: ['apple', 'banana', 'cherry', 'grape', 'mango', 'peach', 'plum', 'orange', 'melon', 'lemon', 'papaya', 'kiwi', 'pear', 'fig', 'lime'],
  },
  {
    clue: 'Strike up the band',
    spangram: 'instruments',
    words: ['violin', 'trumpet', 'drums', 'flute', 'cello', 'oboe', 'guitar', 'piano', 'banjo', 'harp', 'tuba', 'viola', 'organ', 'fiddle', 'bugle'],
  },
  {
    clue: 'Weather report',
    spangram: 'forecast',
    words: ['drizzle', 'thunder', 'breeze', 'cyclone', 'frost', 'sleet', 'hail', 'storm', 'shower', 'gale', 'mist', 'fog', 'wind', 'cloud', 'rain', 'snow'],
  },
  {
    clue: 'Out on the water',
    spangram: 'watercraft',
    words: ['canoe', 'kayak', 'yacht', 'ferry', 'barge', 'dinghy', 'sloop', 'tugboat', 'raft', 'skiff', 'gondola', 'trawler', 'schooner', 'punt'],
  },
  {
    clue: 'Jewelry box',
    spangram: 'gemstones',
    words: ['ruby', 'opal', 'topaz', 'garnet', 'emerald', 'diamond', 'pearl', 'amber', 'jade', 'onyx', 'sapphire', 'agate', 'coral', 'beryl', 'zircon'],
  },
  {
    clue: 'Down on the farm',
    spangram: 'livestock',
    words: ['horse', 'sheep', 'goat', 'chicken', 'donkey', 'turkey', 'duck', 'goose', 'piglet', 'cattle', 'llama', 'mule', 'hen', 'lamb', 'calf'],
  },
  {
    clue: 'Bird watching',
    spangram: 'songbirds',
    words: ['robin', 'sparrow', 'finch', 'cardinal', 'wren', 'swallow', 'thrush', 'warbler', 'lark', 'oriole', 'starling', 'chickadee', 'canary'],
  },
  {
    clue: 'Herb garden',
    spangram: 'seasonings',
    words: ['basil', 'thyme', 'sage', 'oregano', 'parsley', 'mint', 'dill', 'rosemary', 'cilantro', 'chives', 'fennel', 'tarragon', 'cumin', 'clove'],
  },
  {
    clue: 'Kitchen drawer',
    spangram: 'utensils',
    words: ['whisk', 'ladle', 'spatula', 'tongs', 'grater', 'peeler', 'skewer', 'masher', 'sieve', 'spoon', 'fork', 'knife', 'scoop', 'timer'],
  },
  {
    clue: 'Getting around town',
    spangram: 'transport',
    words: ['subway', 'tram', 'ferry', 'bicycle', 'scooter', 'train', 'wagon', 'taxi', 'bus', 'trolley', 'rickshaw', 'moped', 'van', 'cab'],
  },
  {
    clue: 'Look to the night sky',
    spangram: 'astronomy',
    words: ['comet', 'nebula', 'galaxy', 'meteor', 'planet', 'quasar', 'eclipse', 'orbit', 'star', 'moon', 'pulsar', 'cosmos', 'crater', 'nova'],
  },
  {
    clue: 'Save room for it',
    spangram: 'desserts',
    words: ['brownie', 'pudding', 'eclair', 'sundae', 'tart', 'fudge', 'cookie', 'mousse', 'sorbet', 'trifle', 'gelato', 'pie', 'cake', 'flan'],
  },
  {
    clue: 'On your feet',
    spangram: 'footwear',
    words: ['sandal', 'loafer', 'sneaker', 'slipper', 'boot', 'clog', 'moccasin', 'cleat', 'heel', 'wader', 'galosh', 'mule', 'pump', 'flat'],
  },
  {
    clue: 'In the tool shed',
    spangram: 'hardware',
    words: ['hammer', 'wrench', 'pliers', 'chisel', 'drill', 'level', 'sander', 'clamp', 'screw', 'bolt', 'anvil', 'file', 'vise', 'saw', 'nail'],
  },
  {
    clue: 'Deal me in',
    spangram: 'cardgames',
    words: ['poker', 'bridge', 'rummy', 'hearts', 'spades', 'euchre', 'solitaire', 'cribbage', 'canasta', 'pinochle', 'whist', 'snap', 'war'],
  },
  {
    clue: 'Under the sea',
    spangram: 'oceanlife',
    words: ['dolphin', 'octopus', 'urchin', 'seahorse', 'marlin', 'shrimp', 'coral', 'whale', 'squid', 'eel', 'crab', 'lobster', 'oyster', 'ray'],
  },
  {
    clue: 'Baking day',
    spangram: 'ingredients',
    words: ['flour', 'yeast', 'butter', 'sugar', 'vanilla', 'cocoa', 'honey', 'cream', 'salt', 'egg', 'milk', 'cinnamon', 'nutmeg', 'ginger'],
  },
  {
    clue: 'Creepy crawlies',
    spangram: 'insects',
    words: ['beetle', 'cricket', 'mantis', 'cicada', 'hornet', 'weevil', 'earwig', 'aphid', 'moth', 'wasp', 'locust', 'termite', 'firefly', 'gnat', 'flea'],
  },
  {
    clue: 'Paint swatches',
    spangram: 'colorwheel',
    words: ['maroon', 'violet', 'indigo', 'scarlet', 'teal', 'ochre', 'beige', 'mauve', 'crimson', 'azure', 'coral', 'olive', 'tan', 'rust', 'gold'],
  },
  {
    clue: 'Coffee break',
    spangram: 'espresso',
    words: ['latte', 'mocha', 'roast', 'brew', 'decaf', 'crema', 'beans', 'grind', 'filter', 'froth', 'shot', 'drip', 'cup', 'mug'],
  },
  {
    clue: 'May I have this dance',
    spangram: 'ballroom',
    words: ['tango', 'waltz', 'salsa', 'samba', 'polka', 'swing', 'mambo', 'disco', 'foxtrot', 'rumba', 'jive', 'twist', 'bolero', 'conga'],
  },
  {
    clue: 'Fabric store',
    spangram: 'textiles',
    words: ['cotton', 'denim', 'linen', 'satin', 'velvet', 'tweed', 'silk', 'wool', 'suede', 'flannel', 'canvas', 'fleece', 'nylon', 'lace'],
  },
  {
    clue: 'Trees of the forest',
    spangram: 'hardwoods',
    words: ['maple', 'birch', 'cedar', 'aspen', 'willow', 'walnut', 'poplar', 'hickory', 'spruce', 'alder', 'beech', 'oak', 'elm', 'pine', 'fir'],
  },
  {
    clue: 'Breakfast spread',
    spangram: 'brunchtime',
    words: ['waffle', 'omelet', 'bagel', 'muffin', 'granola', 'sausage', 'pancake', 'toast', 'bacon', 'cereal', 'crepe', 'juice', 'jam', 'oats'],
  },
];
