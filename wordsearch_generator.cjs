/**
 * Owen Gallagher
 * 2021-11-27
 * 
 * Generate wordsearch in any language.
 *
 * Note .cjs extension to allow use of [module.]exports instead of export keyword.
 */

// imports

const ENV_UNKNOWN = 'unknown'
const ENV_BACKEND = 'backend'
const ENV_FRONTEND = 'frontend'
let environment = ENV_UNKNOWN

let fs

Promise.all([
	import('fs')
])
.then((modules) => {
	fs = modules[0].default
	environment = ENV_BACKEND
})
.catch(() => {
	fs = undefined
	environment = ENV_FRONTEND
})
.finally(() => {
	// console.log(`wordsearch_generator.js environment = ${environment}`)
})

// class

const LANGUAGE_DEFAULT = 'en'
const CASE_LOWER = 'lower'
const CASE_UPPER = 'upper'
const CASE_DEFAULT = CASE_LOWER
const ALPHABET_FILE = './alphabets.json'
const WIDTH_DEFAULT = 10
const WORD_CLUE_DELIM = ':'

// alphabets.json keys

const KEY_COMMENT = '//comment'
const KEY_RANGES = 'ranges'
const KEY_LOWER_RANGES = KEY_RANGES
const KEY_UPPER_RANGES = `upper_${KEY_RANGES}`

const KEY_COUNTS = 'counts'
const KEY_PROBABILITIES = 'probabilities'
const KEY_ACCUM_PROBABILITIES = 'accum_probabilities'

// wordsearch config keys

const KEY_LANGUAGE = 'language'
const KEY_CASE = 'case'
const KEY_SIZE = 'size'
const KEY_WORDS = 'words'
const KEY_RANDOM_SUBSET = 'random_subset'

class WordsearchGenerator {
	/**
	 * Constructor.
	 *
	 * Instance vars:
	 * 		language
	 * 		alphabet_case
	 *		alphabet_case_key
	 * 		alphabet
	 * 		init_promise
	 *		grid
	 *		words
	 *		clues
	 *		word_cells
	 *		point_to_word_idx
	 *
	 * @param {String} language Language code string.
	 * @param {String} alphabet_case Alphabet case (upper, lower).
	 * @param {Number} width .
	 * @param {Array} words .
	 * @param {Number} random_subset .
	 */
	constructor(language=LANGUAGE_DEFAULT, alphabet_case=CASE_DEFAULT, width=WIDTH_DEFAULT, words, random_subset) {
		this.language = language
		this.alphabet_case = alphabet_case
		
		let case_key
		switch (alphabet_case) {
			case CASE_UPPER:
				case_key = KEY_UPPER_RANGES
				break

			case CASE_LOWER:
			default:
				case_key = KEY_LOWER_RANGES
				break
		}
		this.alphabet_case_key = case_key
		
		this.grid = new Array(width)
		for (let y=0; y<width; y++) {
			this.grid[y] = new Array(width)
		}
		
		this.words = []
		this.clues = []
		this.word_cells = new Array(width)
		for (let y=0; y<width; y++) {
			this.word_cells[y] = new Array(width)
		}
		
		// maps coordinates to indeces in words
		this.point_to_word_idx = {}
		
		this.init_promise = WordsearchGenerator.get_alphabet(this.language, case_key)
		// load alphabet
		.then((alphabet) => {
			this.alphabet = alphabet
		})
		.then(
			// alphabet succeeds
			() => {
				// randomize cells
				this.randomize_cells()
				
				if (words != undefined) {
					// load words (and clues)
					this.add_word_clues(words, random_subset)
				}
				// else, delegate words load to driver
			},
			
			// alphabet fails
			(err) => {
				if (err) {
					console.log(`ERROR: ${err}`)
				}
				this.alphabet = undefined
			}
		)
	}
	
	/**
	 * Generate random content for a single cell.
	 * 
	 * @returns Random content for a single cell (a letter, character, or syllable), or {null} on failure.
	 * @type String
	 */
	random_cell() {
		let accum_probabilities = this.alphabet[KEY_ACCUM_PROBABILITIES]
		
		let ap = 0
		let code_set = undefined
		do {
			if (Math.random() < accum_probabilities[ap]) {
				code_set = this.alphabet[this.alphabet_case_key][ap]
			}
			
			ap++
		} while (code_set === undefined && ap <= accum_probabilities.length)
		
		if (code_set !== undefined) {
			let code = code_set.length == 2
				? Math.round(code_set[0] + (Math.random() * (code_set[1]-code_set[0])))
				: code_set[Math.floor(Math.random() * code_set.length)]
			
			return WordsearchGenerator.code_to_char(code)
		}
		else {
			return null
		}
	}
	
	/**
	 * Fill in random content for all cells in grid.
	 */
	randomize_cells() {
		for (let y=0; y<this.grid.length; y++) {
			for (let x=0; x<this.grid.length; x++) {
				this.grid[y][x] = this.random_cell()
			}
		}
	}
	
	/**
	 * Return string showing grid contents.
	 */
	grid_string(indent='') {
		let grid_rows = new Array(this.grid.length)
		
		for (let y=0; y<this.grid.length; y++) {
			grid_rows[y] = `${indent}${this.grid[y].join(' ')}`
		}
		
		return grid_rows.join('\n')
	}
	
	/**
	 * Load words and clues in bulk.
	 *
	 * @param {Array} word_clues Array of word or word-clue strings.
	 * @param {Number} subset_length .
	 *
	 * @returns passes (placed words) and fails (skipped words).
	 * @type Object
	 */
	add_word_clues(word_clues, subset_length, max_attempts) {
		if (subset_length != undefined) {
			// get random subset of words and clues
			if (subset_length < word_clues.length && subset_length > 0) {
				// set of word-clue indeces
				let subset_idx = new Set()
				while (subset_idx.size < subset_length) {
					subset_idx.add(Math.floor(Math.random() * word_clues.length))
				}
				
				// convert to array
				subset_idx = new Array(...subset_idx)
				// convert to word-clues subset
				let subset = new Array(subset_length)
				for (let i=0; i<subset_idx.length; i++) {
					subset[i] = word_clues[subset_idx[i]]
				}
				
				// assign to word_clues
				word_clues = subset
			}
		}
		
		// add word-clues
		let fails = [], passes = []
		for (let word_clue of word_clues) {
			let array = word_clue.split(WORD_CLUE_DELIM)
			
			let word = array[0]
			let clue = word
			if (array.length == 2) {
				clue = array[1]
			}
			
			if (word.length <= this.grid.length) {
				if (this.add_word_clue(word, clue, max_attempts)) {
					passes.push(word)
				}
				else {
					fails.push(word)
				}
			}
			else {
				fails.push(word)
			}
		}
		
		return {
			passes: passes,
			fails: fails
		}
	}
	
	/**
	 * Add a new word and corresponding clue to the word search.
	 * 
	 * @param {String} word Word.
	 * @param {String} clue Clue.
	 */
	add_word_clue(word, clue, max_attempts=20) {
		let word_arr = word.split('')
		if (Math.random() < 0.5) {
			word_arr.reverse()
		}
		
		let free_width = this.grid.length - word_arr.length + 1
		
		// select direction
		let direction = Math.random()
		
		let attempt = 0
		let placed = false
		while (!placed && attempt < max_attempts) {
			let wxys = new Array(word_arr.length)
			
			// place word in grid
			if (direction < 1/3) {
				// horizontal
				let y = Math.floor(Math.random() * this.grid.length)
				let x = Math.floor(Math.random() * free_width)
				
				let xc,yc=y,w,no_collide=true
				for (let c=0; c<word_arr.length && no_collide; c++) {
					w = word_arr[c]
					xc = x+c
					
					no_collide = this.try_character(w, xc, yc)
					wxys[c] = [w,xc,yc]
				}
				
				if (no_collide) {
					this.place_word(wxys, word, clue)
					placed = true
				}
			}
			else if (direction < 2/3) {
				// vertical
				let y = Math.floor(Math.random() * free_width)
				let x = Math.floor(Math.random() * this.grid.length)
				
				let xc=x,yc,w,no_collide=true
				for (let c=0; c<word_arr.length && no_collide; c++) {
					w = word_arr[c]
					yc = y+c
				
					no_collide = this.try_character(w, xc, yc)
					wxys[c] = [w,xc,yc]
				}
				
				if (no_collide) {
					this.place_word(wxys, word, clue)
					placed = true
				}
			}
			else {
				if (Math.random() < 0.5) {
					// down right (up left)
					let y = Math.floor(Math.random() * free_width)
					let x = Math.floor(Math.random() * free_width)
				
					let xc,yc,w,no_collide=true
					for (let c=0; c<word_arr.length && no_collide; c++) {
						w = word_arr[c]
						xc = x+c
						yc = y+c
					
						no_collide = this.try_character(w, xc, yc)
						wxys[c] = [w,xc,yc]
					}
					
					if (no_collide) {
						this.place_word(wxys, word, clue)
						placed = true
					}
				}
				else {
					// down left (up right)
					let y = Math.floor(Math.random() * free_width)
					let x = this.grid.length-Math.floor(Math.random() * free_width)-1
					
					let xc,yc,w,no_collide=true
					for (let c=0; c<word_arr.length && no_collide; c++) {
						w = word_arr[c]
						xc = x-c
						yc = y+c
						
						no_collide = this.try_character(w, xc, yc)
						wxys[c] = [w,xc,yc]
					}
					
					if (no_collide) {
						this.place_word(wxys, word, clue)
						placed = true
					}
				}
			}
			
			attempt++
		}
		
		if (placed) {
			console.log(`INFO placed ${word} in ${attempt} attempts`)
		}
		return placed
	}
	
	try_character(w, xc, yc) {
		if (this.word_cells[yc][xc] && this.word_cells[yc][xc] != w) {
			// this.grid[yc][xc] = '*'
			return false
		}
		else {
			return true
		}
	}
	
	place_word(wxys, word, clue) {
		// add word to grid and word_cells
		let w,x,y
		for (let wxy of wxys) {
			w = wxy[0]
			x = wxy[1]
			y = wxy[2]
			
			this.grid[y][x] = w
			this.word_cells[y][x] = w
		}
		
		// add word and clue to lists
		let word_idx = this.words.length
		this.words.push(word)
		this.clues.push(clue)
		
		// add word index to point_to_word_idx for detecting answers
		let n = wxys.length-1
		let ab = `${wxys[0][1]},${wxys[0][2]}-${wxys[n][1]},${wxys[n][2]}`
		let ba = `${wxys[n][1]},${wxys[n][2]}-${wxys[0][1]},${wxys[0][2]}`
		this.point_to_word_idx[ab] = word_idx
		this.point_to_word_idx[ba] = word_idx
	}
	
	export_config() {
		let config = {}
		
		config[KEY_LANGUAGE] = this.language
		
		config[KEY_SIZE] = this.grid.length
		
		config[KEY_CASE] = this.alphabet_case
		
		let words = new Array(this.words.length)
		for (let i=0; i<words.length; i++) {
			words[i] = `${this.words[i]}:${this.clues[i]}`
		}
		config[KEY_WORDS] = words
		
		return config
	}
	
	// static methods
	
	/**
	 * Get alphabet description given the language code.
	 * 
	 * @param {String} language Language code.
	 * @param {String} path Path to alphabets file.
	 * 
	 * @returns Promise: resolve alphabet description, or reject if the language is not supported.
	 * @type Object
	 */
	static get_alphabet(language, case_key=CASE_DEFAULT, path=ALPHABET_FILE) {
		return new Promise(function(resolve,reject) {
			if (environment == ENV_FRONTEND) {
				// load with ajax
				$.ajax({
					method: 'GET',
					url: path,
					dataType: 'json',
					success: function(alphabets) {
						// console.log(`DEBUG GET ${path} = ${JSON.stringify(alphabets,null,2)}`)
						WordsearchGenerator.load_alphabet(alphabets[language], case_key, path)
						.then(resolve)
						.catch(reject)
					}
				})
			}
			else if (environment == ENV_BACKEND) {
				// load with nodejs fs module
				fs.readFile(path, function(err, alphabets_json) {
					if (err) {
						console.log(`ERROR alphabets file not found at ${path}`)
						console.log(err)
						reject()
					}
					else {
						WordsearchGenerator.load_alphabet(
							JSON.parse(alphabets_json)[language], case_key, path
						)
						.then(resolve)
						.catch(reject)
					}
				})
			}
			else {
				console.log(`ERROR unable to load alphabets file in unknown environment`)
				reject()
			}
		})
	}
	
	/**
	 * Called by {get_alphabet}.
	 */
	static load_alphabet(alphabet, case_key, path) {
		return new Promise(function(resolve, reject) {
			if (alphabet != undefined) {
				let ranges = alphabet[case_key]
				let count_total = 0
				let counts = []
				
				// count ranges
				// determine relative size of each corresponding set to determine probability
				for (let rset of ranges) {
					let count
	
					if (rset.length == 2) { 
						// defined as min,max
						count = rset[1] - rset[0] + 1
					}
					else {
						// defined as explicit collection a,b,...,z
						count = rset.length
					}
	
					counts.push(count)
					count_total += count
				}

				alphabet[KEY_COUNTS] = counts

				let probabilities = counts.map((c) => {
					return c/count_total
				})
				
				alphabet[KEY_PROBABILITIES] = probabilities
			
				let accum_prob = 0
				let accum_probabilities = new Array(probabilities.length)
				for (let i=0; i<accum_probabilities.length; i++) {
					accum_prob += probabilities[i]
					accum_probabilities[i] = accum_prob
				}
				alphabet[KEY_ACCUM_PROBABILITIES] = accum_probabilities
				
				resolve(alphabet)
			}
			else {
				console.log(`ERROR alphabet not found for language ${language}`)
				reject()
			}
		})
	}
	
	/**
	 * Convert character to unicode value.
	 *
	 * @param {String} char Character.
	 *
	 * @returns Unicode value.
	 * @type Number
	 */
	static char_to_code(char) {
		return char.codePointAt(0)
	}
	
	/**
	 * Convert unicode value to character.
	 *
	 * @param {Number} code Unicode value.
	 *
	 * @returns Character string.
	 * @type String
	 */
	static code_to_char(code) {
		return String.fromCharCode(code)
	}
}

if (typeof exports != 'undefined') {
	// export WordsearchGenerator class
	exports.WordsearchGenerator = WordsearchGenerator
	
	// export useful constants
	exports.WORD_CLUE_DELIM = WORD_CLUE_DELIM
	exports.KEY_LANGUAGE = KEY_LANGUAGE
	exports.KEY_CASE = KEY_CASE
	exports.KEY_SIZE = KEY_SIZE
	exports.KEY_WORDS = KEY_WORDS
	exports.KEY_RANDOM_SUBSET = KEY_RANDOM_SUBSET
	
	// console.log(`DEBUG ${exports}`)
}
else {
	// console.log(`DEBUG no exports`)
}
