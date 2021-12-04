#!node

/**
 * Owen Gallagher
 * 2021-11-27
 */

// external imports

import fs from 'fs'
import rl from 'readline'

// local imports

import { 
	
	WordsearchGenerator,
	
	WORD_CLUE_DELIM,
	
	KEY_LANGUAGE,
	KEY_CASE,
	KEY_SIZE,
	KEY_WORDS,
	KEY_RANDOM_SUBSET
	
} from './wordsearch_generator.cjs'

const cli = rl.createInterface({
	input: process.stdin,
	output: process.stdout
})
let word_count = 0
let word_clues

// define wordsearch
let wordsearch

cli.question('create with file [f] or interactively [i]? ', (input_mode) => {
	if (input_mode == 'f') {
		cli.question('wordsearch json description file: ', (input_file) => {
			cli.close()
			
			fs.readFile(input_file, function(err, input_json) {
				if (err) {
					console.log(`ERROR wordsearch description file ${input_file} not found`)
				}
				else {
					on_file_load(input_json)
				}
			})
		})
	}
	else {
		cli.question('wordsearch width ', (width) => {
			if (width != undefined) {
				width = parseInt(width)
			}
			
			wordsearch = new WordsearchGenerator(
				// 'ko',
				// 'es','upper',
				'en','lower',
				width
			)
			wordsearch.init_promise
			.then(on_alphabet_load)
		})
	}
})

function on_alphabet_load() {
	console.log(
		`DEBUG ${
			wordsearch.language
		} alphabet = ${
			JSON.stringify(wordsearch.alphabet,null,2)
		}`
	)
	
	// test_random_cells(25)
	
	// console.log(`random grid:\n${wordsearch.grid_string()}`)
	
	cli.question('how many words? ', (word_count_str) => {
		word_count = 0
		word_clues = new Array(parseInt(word_count_str))
		
		console.log(`word${WORD_CLUE_DELIM}clue`)
		next_word_clue()
		.then(() => {
			cli.close()
			
			return load_word_clues(word_clues)
		})
		.then(print_wordsearch)
	})
}

function on_file_load(input_json) {
	let desc = JSON.parse(input_json)
	
	wordsearch = new WordsearchGenerator(
		desc[KEY_LANGUAGE],
		desc[KEY_CASE],
		desc[KEY_SIZE],
		// load word-clues via config file
		desc[KEY_WORDS],
		desc[KEY_RANDOM_SUBSET]
	)
	wordsearch.init_promise
	/*
	// load word-clues via driver
	.then(() => {
		load_word_clues(desc['words'])
	})
	*/
	.then(print_wordsearch)
}

function next_word_clue() {
	return new Promise(function(resolve) {
		cli.question(`${word_count+1} = `, (word_clue) => {
			word_clues[word_count++] = word_clue
			
			if (word_count < word_clues.length) {
				// console.log(`${word_count} < ${word_clues.length}`)
				next_word_clue()
				.then(resolve)
			}
			else {
				resolve()
			}
		})
	})
}

function test_random_cells(reps) {
	let random_cells = []
	for (let i=0; i<reps; i++) {
		random_cells.push(wordsearch.random_cell())
	}
	console.log(random_cells.join(','))
}

function load_word_clues(word_clues, clue_delim=WORD_CLUE_DELIM) {
	for (let word_clue of word_clues) {
		let array = word_clue.split(clue_delim)
		
		let word = array[0]
		let clue = word
		if (array.length == 2) {
			clue = array[1]
		}
		
		if (word.length <= wordsearch.grid.length) {
			if (!wordsearch.add_word_clue(word,clue)) {
				console.log(`ERROR failed to find a place for ${word}`)
			}
		}
		else {
			console.log(`ERROR ${word} length ${word.length} longer than board width ${wordsearch.grid.length}`)
		}
	}
	
	return Promise.resolve()
}

function print_wordsearch() {
	console.log(`final grid:\n\n${wordsearch.grid_string()}\n`)
	
	console.log(`clues:\n\n${wordsearch.clues.join('\n')}\n`)
}
