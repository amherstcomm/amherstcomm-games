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
  {
    clue: 'Slice of the action',
    spangram: 'pizzeria',
    words: ['pepperoni', 'sausage', 'mushroom', 'olive', 'garlic', 'anchovy', 'pineapple', 'pepper', 'tomato', 'cheese', 'basil', 'crust', 'dough', 'oregano', 'salami'],
  },
  {
    clue: 'Family fun after dinner',
    spangram: 'gamenight',
    words: ['chess', 'checkers', 'dominoes', 'charades', 'trivia', 'puzzle', 'dice', 'cards', 'bingo', 'marbles', 'jacks', 'hangman', 'riddle', 'token'],
  },
  {
    clue: 'Up, up, and away',
    spangram: 'takeflight',
    words: ['airplane', 'glider', 'balloon', 'rocket', 'drone', 'blimp', 'zeppelin', 'biplane', 'parachute', 'kite', 'seaplane', 'airship'],
  },
  {
    clue: 'Cold-blooded companions',
    spangram: 'reptiles',
    words: ['lizard', 'gecko', 'iguana', 'turtle', 'snake', 'python', 'cobra', 'viper', 'tortoise', 'chameleon', 'skink', 'crocodile', 'alligator', 'monitor'],
  },
  {
    clue: 'Grassland giants',
    spangram: 'onsafari',
    words: ['elephant', 'giraffe', 'zebra', 'rhino', 'hippo', 'cheetah', 'leopard', 'gazelle', 'baboon', 'hyena', 'warthog', 'antelope', 'buffalo', 'impala', 'lion'],
  },
  {
    clue: 'Bundle up',
    spangram: 'wintertime',
    words: ['sleigh', 'icicle', 'mitten', 'snowman', 'blizzard', 'skating', 'frost', 'cocoa', 'scarf', 'igloo', 'flurry', 'toboggan', 'parka', 'shovel'],
  },
  {
    clue: 'Life is better in flip-flops',
    spangram: 'boardwalk',
    words: ['sunscreen', 'umbrella', 'snorkel', 'surfing', 'bucket', 'seashell', 'sandbar', 'towel', 'breeze', 'tide', 'wave', 'dune', 'cooler', 'shovel'],
  },
  {
    clue: 'Happy campers',
    spangram: 'campground',
    words: ['lantern', 'compass', 'canteen', 'backpack', 'hammock', 'campfire', 'firewood', 'kindling', 'thermos', 'cabin', 'trail', 'tent', 'matches'],
  },
  {
    clue: 'Turn up the volume',
    spangram: 'jukebox',
    words: ['jazz', 'blues', 'reggae', 'techno', 'country', 'gospel', 'funk', 'disco', 'metal', 'punk', 'opera', 'folk', 'soul', 'rock', 'anthem', 'ballad'],
  },
  {
    clue: 'Back to school',
    spangram: 'classroom',
    words: ['pencil', 'eraser', 'notebook', 'teacher', 'recess', 'locker', 'crayon', 'ruler', 'chalk', 'binder', 'homework', 'quiz', 'desk', 'marker'],
  },
  {
    clue: 'On the side',
    spangram: 'condiments',
    words: ['ketchup', 'mustard', 'relish', 'mayo', 'salsa', 'pesto', 'chutney', 'wasabi', 'vinegar', 'pickle', 'tartar', 'aioli', 'gravy', 'syrup'],
  },
  {
    clue: 'Al dente',
    spangram: 'spaghetti',
    words: ['penne', 'ravioli', 'lasagna', 'macaroni', 'linguine', 'rigatoni', 'fusilli', 'orzo', 'gnocchi', 'ziti', 'noodle', 'rotini'],
  },
  {
    clue: 'Trick or treat',
    spangram: 'halloween',
    words: ['pumpkin', 'ghost', 'witch', 'goblin', 'vampire', 'zombie', 'skeleton', 'spider', 'candy', 'costume', 'haunted', 'cauldron', 'broomstick', 'lantern'],
  },
  {
    clue: 'Deck the halls',
    spangram: 'yuletide',
    words: ['tinsel', 'wreath', 'carol', 'garland', 'mistletoe', 'eggnog', 'reindeer', 'stocking', 'ornament', 'ribbon', 'candle', 'sleigh', 'cocoa', 'chimney'],
  },
  {
    clue: 'Nine to five',
    spangram: 'workplace',
    words: ['stapler', 'printer', 'folder', 'meeting', 'cubicle', 'keyboard', 'monitor', 'deadline', 'memo', 'inbox', 'badge', 'ledger', 'coffee', 'desk'],
  },
  {
    clue: 'Airing dirty laundry',
    spangram: 'laundromat',
    words: ['detergent', 'washer', 'dryer', 'hamper', 'bleach', 'softener', 'hanger', 'basket', 'stain', 'rinse', 'wrinkle', 'socks', 'lint', 'iron'],
  },
  {
    clue: 'In bloom',
    spangram: 'flowerbed',
    words: ['tulip', 'daisy', 'orchid', 'peony', 'lilac', 'dahlia', 'zinnia', 'crocus', 'poppy', 'lotus', 'aster', 'pansy', 'petunia', 'marigold', 'iris'],
  },
  {
    clue: 'Well-rounded (and otherwise)',
    spangram: 'geometry',
    words: ['circle', 'square', 'triangle', 'hexagon', 'octagon', 'rhombus', 'ellipse', 'sphere', 'cube', 'prism', 'cylinder', 'pyramid', 'cone', 'oval'],
  },
  {
    clue: 'Pocket change',
    spangram: 'currency',
    words: ['nickel', 'penny', 'quarter', 'dollar', 'dime', 'peso', 'franc', 'rupee', 'pound', 'krona', 'euro', 'shilling', 'wallet', 'billfold'],
  },
  {
    clue: 'Little ones',
    spangram: 'babyanimals',
    words: ['kitten', 'puppy', 'duckling', 'tadpole', 'foal', 'chick', 'fawn', 'gosling', 'owlet', 'colt', 'joey', 'cygnet', 'calf', 'lamb', 'piglet'],
  },
  {
    clue: 'Days of yore',
    spangram: 'medieval',
    words: ['castle', 'knight', 'dragon', 'jester', 'armor', 'sword', 'shield', 'dungeon', 'throne', 'crown', 'joust', 'squire', 'herald', 'moat', 'drawbridge'],
  },
  {
    clue: 'Ahoy, matey',
    spangram: 'buccaneer',
    words: ['treasure', 'parrot', 'plank', 'cutlass', 'doubloon', 'anchor', 'galleon', 'eyepatch', 'booty', 'spyglass', 'kraken', 'sail', 'crew', 'cannon'],
  },
  {
    clue: 'Solve the case',
    spangram: 'whodunit',
    words: ['clue', 'suspect', 'motive', 'alibi', 'sleuth', 'witness', 'evidence', 'mystery', 'culprit', 'disguise', 'stakeout', 'dossier', 'detective', 'forgery'],
  },
  {
    clue: 'Feel the burn',
    spangram: 'breakasweat',
    words: ['pushup', 'situp', 'squat', 'lunge', 'burpee', 'treadmill', 'dumbbell', 'barbell', 'yoga', 'cardio', 'stretch', 'jogging', 'pilates', 'crunch'],
  },
  {
    clue: 'On the rise',
    spangram: 'breadbasket',
    words: ['baguette', 'ciabatta', 'sourdough', 'brioche', 'pretzel', 'crumpet', 'biscuit', 'scone', 'pita', 'naan', 'roll', 'challah', 'focaccia', 'crouton'],
  },
  {
    clue: 'Say cheese',
    spangram: 'cheeseboard',
    words: ['cheddar', 'gouda', 'brie', 'feta', 'parmesan', 'ricotta', 'swiss', 'havarti', 'muenster', 'provolone', 'asiago', 'edam', 'colby', 'gruyere'],
  },
  {
    clue: 'Lay of the land',
    spangram: 'landscape',
    words: ['valley', 'canyon', 'plateau', 'ridge', 'summit', 'glacier', 'meadow', 'tundra', 'prairie', 'delta', 'mesa', 'butte', 'ravine', 'cliff', 'foothill'],
  },
  {
    clue: 'A stitch in time',
    spangram: 'needlework',
    words: ['thread', 'bobbin', 'thimble', 'stitch', 'pattern', 'button', 'zipper', 'seam', 'tailor', 'quilt', 'hemline', 'embroidery', 'pincushion'],
  },
  {
    clue: 'Picture perfect',
    spangram: 'photograph',
    words: ['camera', 'tripod', 'shutter', 'aperture', 'flash', 'zoom', 'exposure', 'portrait', 'darkroom', 'negative', 'pixel', 'frame', 'lens', 'selfie'],
  },
  {
    clue: 'Under the hood',
    spangram: 'automobile',
    words: ['engine', 'brake', 'clutch', 'bumper', 'fender', 'muffler', 'piston', 'radiator', 'axle', 'chassis', 'gasket', 'throttle', 'hubcap', 'wiper', 'ignition'],
  },
  {
    clue: 'Sweet dreams',
    spangram: 'lightsout',
    words: ['pillow', 'blanket', 'pajamas', 'lullaby', 'slumber', 'snooze', 'mattress', 'nightcap', 'yawn', 'cradle', 'doze', 'dream', 'quilt', 'siesta'],
  },
  {
    clue: 'Written in the stars',
    spangram: 'horoscope',
    words: ['aries', 'taurus', 'gemini', 'cancer', 'virgo', 'libra', 'scorpio', 'pisces', 'aquarius', 'zodiac'],
  },
  {
    clue: 'Legendary creatures',
    spangram: 'mythical',
    words: ['phoenix', 'griffin', 'unicorn', 'mermaid', 'centaur', 'pegasus', 'minotaur', 'cyclops', 'sphinx', 'hydra', 'titan', 'banshee', 'wyvern', 'gorgon'],
  },
  {
    clue: 'Going nuts',
    spangram: 'nutcracker',
    words: ['almond', 'cashew', 'pecan', 'walnut', 'peanut', 'pistachio', 'hazelnut', 'chestnut', 'macadamia', 'acorn', 'filbert', 'kernel'],
  },
];
