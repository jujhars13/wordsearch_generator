/**
 * Owen Gallagher
 * 2021-11-30
 */

const current_script = document.currentScript
const INPUT_FILE = 0
const INPUT_FORM = 1

const D3_DSV_URL = 'https://cdn.jsdelivr.net/npm/d3-dsv@3'

const USE_WP_HOST_URL = true
const WP_HOST_URL = 'https://wordsearch.dreamhosters.com'
const DEPENDENCIES_URL = '/webpage_dependencies.html'
const WORDSEARCH_COMPONENT_URL = '/wordsearch_webcomponent.html'
const WORDSEARCH_CORE_URL = '/wordsearch_generator.js'
const DEFAULT_WORDSEARCH_CONTAINERS_SELECTOR = '.wordsearch-container'

const REM_MIN = 5

const ESCAPE_CHAR = {
	'b': '\b',
	'f': '\f',
	'n': '\n',
	'r': '\r',
	't': '\t',
	'v': '\v',
	'\'': '\'',
	'"': '"',
	'\\': '\\'
}

// global vars corresponding to each wordsearch generator component by id
let wordsearch_input_type = {}
let wordsearch_use_words_file = {}
let wordsearch_is_random_subset = {}
let wordsearch_global = {}
// TODO rename to wordsearch_words_file
let wordsearch_word_clues = {}
let wordsearch_description_json = {}

let endpoint_cells = []

let wordsearch_webpage_promise = new Promise(function(resolve, reject) {
	Promise.all([
		// external/peripheral dependencies
		new Promise(function(resolve_ext, reject_ext) {
			let url = USE_WP_HOST_URL
				? `${WP_HOST_URL}${DEPENDENCIES_URL}`
				: DEPENDENCIES_URL
	
			$.ajax({
				method: 'GET',
				url: url,
				dataType: 'html',
				success: function(dependencies_html) {
					console.log(`DEBUG loaded wordsearch dependencies html of length ${dependencies_html.length}`)
					$('head').append(dependencies_html)
					resolve_ext()
				},
				error: function(err) {
					console.log(`ERROR failed to get dependencies at ${url}`)
					reject()
				}
			})
		}),
		
		// core dependencies
		new Promise(function(resolve_core) {
			let url = USE_WP_HOST_URL
				? `${WP_HOST_URL}${WORDSEARCH_CORE_URL}`
				: WORDSEARCH_CORE_URL
			
			$.getScript(WORDSEARCH_CORE_URL)
			.done(function() {
				ext_js_dependencies()
				wordsearch_webpage_main()
				.then(resolve_core)
			})
		})
	])
	.then(resolve)
})

// load wordsearch web component and resolve the html as a string
let wordsearch_component_promise = new Promise(function(resolve, reject) {
	let url = USE_WP_HOST_URL
		? `${WP_HOST_URL}${WORDSEARCH_COMPONENT_URL}`
		: WORDSEARCH_COMPONENT_URL
	
	$.ajax({
		method: 'GET',
		url: url,
		dataType: 'html',
		cache: false,
		success: function(component_html) {
			resolve(component_html)
		},
		error: function(err) {
			console.log(`ERROR failed to get wordsearch web component at ${url}`)
			reject()
		}
	})
})

window.onload = function(e) {
	let alphabets
	
	wordsearch_webpage_promise
	.then(
		function() {
			console.log('INFO wordsearch load passed')
			
			return Promise.resolve()
		},
		function(err) {
			if (err) {
				console.log(err)
			}
	
			$('body').append(
				`<div class="wordsearch-component-error">
					Failed to fetch wordsearch component dependencies
				</div>`
			)
			
			return Promise.reject()
		}
	)
}

function ext_js_dependencies() {
	return new Promise(function(resolve, reject) {
		let url = D3_DSV_URL
		$.getScript(url)
		.done(function() {
			// alias d3 as dsv to match used variable in core
			dsv = d3
			delete d3
		})
		.fail(function() {
			console.log('ERROR failed to load d3-dsv frontend dsv parser library')
		})
	})
}

function wordsearch_webpage_main() {
	console.log('DEBUG on_dependencies_load()')
	let p = WordsearchGenerator.get_alphabet_aliases()
	.catch(function(err) {
		if (err) {
			console.log(err)
			console.log(`ERROR failed to load alphabet options`)
		}
	})
	.then(function(alphabet_aliases) {
		alphabets = alphabet_aliases
	})
	.then(function() {
		return wordsearch_component_promise
	})
	.catch(function(err) {
		if (err) {
			console.log(err)
		}
		
		$('body').append(
			`<div class="wordsearch-component-error">Failed to fetch wordsearch component</div>`
		)
	})
	.then(function(wordsearch_html) {
		// get attributes from script tag
		// unsure why referencing document.currentScript here returns null
		let script_jq = $(current_script)
		
		let wordsearch_containers_selector = script_jq.attr('data-containers')
		if (wordsearch_containers_selector == undefined) {
			wordsearch_containers_selector = DEFAULT_WORDSEARCH_CONTAINERS_SELECTOR
		}
		console.log(`INFO wordsearch containers selector = ${wordsearch_containers_selector}`)
		
		delete script_jq
		
		// load wordsearch components into each container
		$(wordsearch_containers_selector).each(function(idx) {
			console.log(`DEBUG load wordsearch generator component ${idx}`)
			
			// load component
			let wordsearch_jq = $(wordsearch_html)
			
			// uniquely identify
			let wordsearch_id = `wordsearch-component-${new Date().toISOString()}`
			.replaceAll(':','-')
			.replaceAll('.','-')
			wordsearch_jq.attr('id', wordsearch_id)
			
			// append to container
			$(this).append(wordsearch_jq)
			
			set_wordsearch_input_type(wordsearch_id, INPUT_FILE)
			set_wordsearch_is_random_subset(wordsearch_id, false)
			
			// handle input choice
			wordsearch_jq.find('.wordsearch-input-file').click(function() {
				set_wordsearch_input_type(wordsearch_id, INPUT_FILE)
			})
			wordsearch_jq.find('.wordsearch-input-form').click(function() {
				set_wordsearch_input_type(wordsearch_id, INPUT_FORM)
			})
			
			// handle alphabet choices list
			let langs_jq = wordsearch_jq.find('.languages')
			
			// show on focus
			wordsearch_jq.find('.language')
			.on('focusin', function() {
				// show alphabets
				langs_jq.show()
			})
			.on('focusout', function(event) {
				// potentially allow a language option to accept a click event before disappearing
				setTimeout(() => {
					langs_jq.hide()
				}, 100)
			})
			
			const alphabet_option_template = 
			`<div class="language-option px-2">
				<span class="alphabet-key"></span>
				<span class="alphabet-aliases"></span>
			</div>`
			
			// display alphabets in list
			for (let alphabet_key in alphabets) {
				// console.log(`debug loaded alphabet:\b${JSON.stringify(alphabet_key)}`)
				let alphabet_jq = $(alphabet_option_template)
				.attr('data-alphabet-key', alphabet_key)
				
				alphabet_jq.find('.alphabet-key').html(alphabet_key)
				alphabet_jq.find('.alphabet-aliases').html(alphabets[alphabet_key].join(' '))
				
				langs_jq.append(alphabet_jq)
				
				// handle alphabet click
				alphabet_jq.on('click', function(event) {
					on_alphabet_option_click(wordsearch_id, event)
				})
			}
			
			// set default wordsearch size
			wordsearch_jq.find('.size-width')
			.attr('placeholder', WordsearchGenerator.WIDTH_DEFAULT)
			wordsearch_jq.find('.size-height')
			.attr('placeholder', WordsearchGenerator.WIDTH_DEFAULT)
			
			// handle description file upload
			wordsearch_jq.find('.wordsearch-file').on('change', function() {
				let filereader = new FileReader()
				filereader.onload = function() {
					wordsearch_description_json[wordsearch_id] = filereader.result
					on_wordsearch_input_file(wordsearch_id, wordsearch_description_json[wordsearch_id])
				}
				filereader.readAsText($(this).prop('files')[0])
			})
			
			// handle words file upload
			wordsearch_jq.find('.words-file').on('change', function() {
				let filereader = new FileReader()
				filereader.onload = function() {
					wordsearch_word_clues[wordsearch_id] = filereader.result
				}
				filereader.readAsText($(this).prop('files')[0])
			})
			
			// handle word-clue delim input
			wordsearch_jq.find('.words-file-delim')
			.attr('placeholder', WordsearchGenerator.WORD_CLUE_DELIM)
			
			// handle whitespace controls
			let cell_padx = 16
			let cell_padx_min = 0
			let cell_padx_max = cell_padx * 2
			wordsearch_jq.find('.whitespace-label').html(cell_padx)
			wordsearch_jq.find('.whitespace-control')
			.attr('min', cell_padx_min)
			.attr('max', cell_padx_max)
			.attr('step', (cell_padx_max - cell_padx_min) / 20)
			.val(cell_padx)
			.on('input', function() {
				let new_cell_padx = parseFloat($(this).val())
				
				wordsearch_jq.find('.ws-cell')
				.css('padding-left', new_cell_padx)
				.css('padding-right', new_cell_padx)
				
				wordsearch_jq.find('.whitespace-label').html(Math.round(new_cell_padx))
			})
			
			// handle font size controls
			let cell_font = rem_to_px(2.25)
			let font_min = 8
			let font_max = cell_font * 2.5
			
			let answer_font = rem_to_px(1.5) / cell_font
			
			wordsearch_jq.find('.font-size-label').html(cell_font)
			wordsearch_jq.find('.font-size-control')
			.attr('min', font_min)
			.attr('max', font_max)
			.attr('step', (font_max - font_min) / 20)
			.val(cell_font)
			.on('input', function() {
				let new_cell_font = parseFloat($(this).val())
				
				wordsearch_jq.find('.ws-cell').css('fontSize', new_cell_font)
				wordsearch_jq.find('.ws-answer').css('fontSize', new_cell_font * answer_font)
				
				wordsearch_jq.find('.font-size-label').html(Math.round(new_cell_font))
			})
			
			// handle reload button
			wordsearch_jq.find('.wordsearch-reload').click(function() {
				// console.log(`DEBUG wordsearch reload button ${wordsearch_id}`)
				switch (wordsearch_input_type[wordsearch_id]) {
					case INPUT_FILE:
						let description_json = wordsearch_description_json[wordsearch_id]
						let config = description_json == undefined 
							? undefined
							: JSON.parse(description_json)
						
						if (config != undefined) {
							// use random subset count input if enabled
							if (wordsearch_is_random_subset[wordsearch_id]) {
								let ui_subset_length = wordsearch_jq.find('.random-subset-count').val()
								if (ui_subset_length !== '') {
									ui_subset_length = parseInt(ui_subset_length)
									// console.log(`DEBUG ui subset length = ${ui_subset_length}`)
									config['random_subset'] = ui_subset_length
								}
							}
							
							on_wordsearch_input_file(wordsearch_id, config)
						}
						else {
							console.log(`ERROR wordsearch config file not defined`)
						}
						
						break
			
					case INPUT_FORM:
						on_wordsearch_input_form(wordsearch_id)
						break
				}
				
				// reset whitespace control
				wordsearch_jq.find('.whitespace-label').html(cell_padx)
				wordsearch_jq.find('.whitespace-control').val(cell_padx)
				
				// reset font size control
				wordsearch_jq.find('.font-size-label').html(cell_font)
				wordsearch_jq.find('.font-size-control').val(cell_font)
			})
	
			// handle word-clue add button click
			wordsearch_jq.find('.add-word-clue').click(function() {
				let datetime_str = new Date().toISOString()
				let containerjq = wordsearch_jq.find('.word-clues')
				let rowjq = $(
					`<div class="row word-clue mt-1 gx-1" data-when="${datetime_str}">
						<div class="col">
							<input type="text" placeholder="word" class="word-clue-word form-control"/>
						</div>
						<div class="col">
							<input type="text" placeholder="clue (optional)" class="word-clue-clue form-control"/>
						</div>
						<div class="col-auto d-flex flex-column justify-content-center">
							<button 
								class="btn btn-danger word-clue-delete" 
								data-wordsearch-id="${wordsearch_id}"
								data-when="${datetime_str}"
								onclick="on_word_clue_delete_click(event)">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24" fill="currentColor" class="bi bi-dash-lg" viewBox="0 0 16 16">
									<path fill-rule="evenodd" d="M2 8a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 8Z"/>
								</svg>
							</button>
						</div>
					</div>`
				)
				containerjq.append(rowjq)
			})
			
			// handle words file button click
			wordsearch_jq.find('.words-file-button').click(function() {
				set_wordsearch_use_words_file(wordsearch_id, !is_on($(this)))
			})
			
			// handle random subset button click
			wordsearch_jq.find('.random-subset').click(function() {
				set_wordsearch_is_random_subset(wordsearch_id, !is_on($(this)))
			})
			
			// handle print button
			wordsearch_jq.find('.wordsearch-print').click(function() {
				// clean wordsearch
				wordsearch_jq.find('.wordsearch').addClass('printable')
		
				// hide config
				wordsearch_jq.find('.wordsearch-config').addClass('printable')
		
				// hide answers header
				wordsearch_jq.find('.answers-header').addClass('printable')
		
				// hide answers
				wordsearch_jq.find('.ws-word').addClass('printable')
		
				// show print-only
				wordsearch_jq.find('.printscreen-only').addClass('printable')
			})
			
			// handle screen button
			wordsearch_jq.find('.wordsearch-screen').click(function() {
				// mark wordsearch
				wordsearch_jq.find('.wordsearch').removeClass('printable')
		
				// show config
				wordsearch_jq.find('.wordsearch-config').removeClass('printable')
		
				// show answers header
				wordsearch_jq.find('.answers-header').removeClass('printable')
		
				// show answers
				wordsearch_jq.find('.ws-word').removeClass('printable')
		
				// hide print-only
				wordsearch_jq.find('.printscreen-only').removeClass('printable')
			})
			
			// handle export config button
			wordsearch_jq.find('.wordsearch-export-config').click(function() {
				if (wordsearch_global[wordsearch_id] != undefined) {
					let wordsearch_json_encoded = btoa(unescape(encodeURIComponent(
						JSON.stringify(wordsearch_global[wordsearch_id].export_config())
					)))
					console.log(`DEBUG encoded export = ${wordsearch_json_encoded}`)
			
					wordsearch_jq.find('.wordsearch-export-link')
					.prop('href',`data:application/json;base64,${wordsearch_json_encoded}`)
					.prop('download',`wordsearch_cfg_${new Date().toISOString()}.json`)
					[0].click()
				}
			})
		})
		.promise().done(() => {
			return Promise.resolve()
		})
	})
	
	return p
}

// TODO rename to set_wordsearch_config_type
function set_wordsearch_input_type(wordsearch_cmp_id, input_type) {
	// console.log(`DEBUG ${wordsearch_cmp_id} set input type=${input_type}`)
	let wordsearch_cmp = $(`#${wordsearch_cmp_id}`)
	wordsearch_input_type[wordsearch_cmp_id] = input_type
	
	switch (input_type) {
		case INPUT_FILE:
			wordsearch_cmp.find('.wordsearch-input-file').removeClass('btn-outline-secondary').addClass('btn-secondary')
			wordsearch_cmp.find('.wordsearch-input-form').removeClass('btn-secondary').addClass('btn-outline-secondary')
			wordsearch_cmp.find('.wordsearch-files').show()
			wordsearch_cmp.find('.wordsearch-form').hide()
			break
			
		case INPUT_FORM:
			wordsearch_cmp.find('.wordsearch-input-file').removeClass('btn-secondary').addClass('btn-outline-secondary')
			wordsearch_cmp.find('.wordsearch-input-form').removeClass('btn-outline-secondary').addClass('btn-secondary')
			wordsearch_cmp.find('.wordsearch-files').hide()
			wordsearch_cmp.find('.wordsearch-form').show()
			break
	}
}

function set_wordsearch_use_words_file(wordsearch_cmp_id, use_file) {
	let wordsearch_cmp = $(`#${wordsearch_cmp_id}`)
	wordsearch_use_words_file[wordsearch_cmp_id] = use_file
	
	// update button data
	wordsearch_cmp.find('.words-file-button')
	.attr('data-on', use_file)
	.addClass(use_file ? 'btn-secondary' : 'btn-outline-secondary')
	.removeClass(use_file ? 'btn-outline-secondary' : 'btn-secondary')
	
	// update words file input
	wordsearch_cmp.find('.words-file')
	.prop('disabled', !use_file)
	
	// update word-clue delimiter input
	wordsearch_cmp.find('.words-file-delim')
	.prop('disabled', !use_file)
	
	// update word-clues inputs
	wordsearch_cmp.find('.word-clue input')
	.prop('disabled', use_file)
}

function set_wordsearch_is_random_subset(wordsearch_cmp_id, is_random, subset_length) {
	let wordsearch_cmp = $(`#${wordsearch_cmp_id}`)
	wordsearch_is_random_subset[wordsearch_cmp_id] = is_random
	
	// update button data
	wordsearch_cmp.find('.random-subset')
	.attr('data-on', is_random)
	.addClass(is_random ? 'btn-secondary' : 'btn-outline-secondary')
	.removeClass(is_random ? 'btn-outline-secondary' : 'btn-secondary')
	
	// update count input
	if (is_random) {
		wordsearch_cmp.find('.random-subset-count')
		.prop('disabled', false)
		.val(subset_length)
	}
	else {
		wordsearch_cmp.find('.random-subset-count')
		.prop('disabled', true)
	}
}

// TODO rename to on_wordsearch_config_file
function on_wordsearch_input_file(wordsearch_cmp_id, wordsearch_json) {
	if (wordsearch_json != undefined) {
		console.log(`INFO ${wordsearch_cmp_id}:on_wordsearch_input_file`)
		let description = typeof wordsearch_json === 'string' 
			? JSON.parse(wordsearch_json)
			: wordsearch_json
		
		let random_subset = description[WordsearchGenerator.KEY_RANDOM_SUBSET]
		
		let use_words_file = wordsearch_use_words_file[wordsearch_cmp_id]
		
		// get word-clue delimiter from config file
		let words_delim = description[WordsearchGenerator.KEY_WORDS_DELIM]
		if (words_delim == undefined || use_words_file) {
			// get word-clue delimiter from delimiter input
			words_delim = $(`#${wordsearch_cmp_id} .words-file-delim`).val()
			
			if (words_delim == '') {
				// undefine to use default
				words_delim = undefined
			}
		}
		
		new Promise(function(resolve) {
			let word_clues = wordsearch_word_clues[wordsearch_cmp_id]
			if (!use_words_file || word_clues == undefined) {
				// use word-clues embedded in config file
				word_clues = description[WordsearchGenerator.KEY_WORDS]
				
				/* 
				Frontend constructor will attempt to parse string as words file data, but in this
				case, a string is a dsv file path that is not usable in frontend env directly.
				*/
				if (typeof word_clues == 'string') {
					console.log(
						`WARNING unable to access words file ${
							word_clues
						} in webpage via path directly. Use the dsv file input instead.`
					)
					word_clues = undefined
				}
				
				resolve(word_clues)
			}
			else {
				// parse word-clues from dsv file
				parse_wordsearch_words_file(word_clues, words_delim)
				.then(resolve)
				.catch(() => {
					resolve(undefined)
				})
			}
		})
		.then((word_clues) => {
			console.log('DEBUG init new wordsearch generator')
			let wordsearch = new WordsearchGenerator(
				description[WordsearchGenerator.KEY_LANGUAGE],
				description[WordsearchGenerator.KEY_CASE],
				description[WordsearchGenerator.KEY_SIZE],
				word_clues,
				random_subset,
				description[WordsearchGenerator.KEY_TITLE],
				words_delim
			)
		
			if (random_subset != undefined) {
				set_wordsearch_is_random_subset(wordsearch_cmp_id, true, random_subset)
			}
			
			return wordsearch.init_promise.then(() => {
				return Promise.resolve(wordsearch)
			})
		})
		.then((wordsearch) => {
			display_wordsearch(wordsearch, wordsearch_cmp_id)
		})
	}
	else {
		console.log('ERROR wordsearch description not defined')
	}
}

// TODO rename to on_wordsearch_config_form
function on_wordsearch_input_form(wordsearch_cmp_id) {
	console.log(`${wordsearch_cmp_id}:on_wordsearch_input_form`)
	let wordsearch_cmp = $(`#${wordsearch_cmp_id}`)
	
	try {
		let width_str = wordsearch_cmp.find('.size-width').val().trim()
		if (width_str == '') {
			width_str = (WordsearchGenerator.WIDTH_DEFAULT).toString()
		}
		let height_str = wordsearch_cmp.find('.size-height').val().trim()
		if (height_str == '') {
			height_str = (WordsearchGenerator.WIDTH_DEFAULT).toString()
		}
		
		// load initial config
		let wordsearch = new WordsearchGenerator(
			wordsearch_cmp.find('.language').val().trim().toLowerCase(),
			wordsearch_cmp.find('.case').val().trim().toLowerCase(),
			[
				parseInt(width_str),
				parseInt(height_str)
			]
		)
		
		wordsearch.init_promise.then(() => {
			new Promise(function(res_words) {
				let use_words_file = wordsearch_use_words_file[wordsearch_cmp_id]
				let word_clues = wordsearch_word_clues[wordsearch_cmp_id]
				
				if (use_words_file && word_clues != undefined) {					
					// use words file
					console.log(`DEBUG use word-clues from words file ${word_clues}`)
					
					// get delimiter
					let words_delim = wordsearch_cmp.find('.words-file-delim').val()
					if (words_delim == '') {
						// undefine to use default delimiter
						words_delim = undefined
					}
					
					// parse words file
					parse_wordsearch_words_file(word_clues, words_delim)
					.then(res_words)
					.catch(() => {
						res_words(undefined)
					})
				}
				else {
					// use word-clue rows in form
					word_clues = []
					
					wordsearch_cmp.find('.word-clue').each(function(idx) {
						// read word and clue from row
						let rowjq = $(this)
				
						let word = rowjq.find('.word-clue-word').val()
						let clue = rowjq.find('.word-clue-clue').val()
						if (word !== '') {
							if (clue === '') {
								clue = word
							}
					
							console.log(`DEBUG word:clue ${word}:${clue}`)
							word_clues.push([word, clue])
						}
					})
					.promise()
					.done(() => {
						res_words(word_clues)
					})
				}
			})
			.then(function(word_clues) {
				load_word_clues(wordsearch_cmp_id, wordsearch, word_clues)
				
				display_wordsearch(wordsearch, wordsearch_cmp_id)
			})
		})
	}
	catch (err) {
		console.log(err)
		console.log(`ERROR wordsearch config is invalid: ${err}`)
	}
}

function parse_wordsearch_words_file(words_dsv, words_delim) {
	return WordsearchGenerator.load_words_file_dsv(
		words_dsv,
		unescape_backslashes(words_delim)
	)
}

/**
 * Load a word-clue array into the specified wordsearch.
 *
 * @param {String} wordsearch_cmp_id .
 * @param {WordsearchGenerator} wordsearch .
 * @param {Array} word_clues Array of either word-clue arrays or delimited strings.
 *
 * @returns Resolves undefined.
 * @type Promise
 */
function load_word_clues(wordsearch_cmp_id, wordsearch, word_clues) {
	let wordsearch_cmp = $(`#${wordsearch_cmp_id}`)
	
	if (wordsearch_is_random_subset) {
		console.log('DEBUG is random subset')
		
		let subset_count_jq = $(`#${wordsearch_cmp_id}`).find('.random-subset-count')
		if (subset_count_jq.val() == '') {
			subset_count_jq.val(word_clues.length)
		}
		
		// show answer count in random subset input
		let subset_length = parseInt(subset_count_jq.val())
		
		// get random subset of words and clues
		if (subset_length < word_clues.length && subset_length > 0) {
			let subset_idx = new Set()
			while (subset_idx.size < subset_length) {
				subset_idx.add(Math.floor(Math.random() * word_clues.length))
			}
			
			subset_idx = new Array(...subset_idx)
			let subset = new Array(subset_length)
			for (let i=0; i < subset_idx.length; i++) {
				subset[i] = word_clues[subset_idx[i]]
			}
			
			word_clues = subset
		}
	}
	else {
		wordsearch_cmp.find('.random-subset-count').val('')
	}
	
	console.log(`DEBUG word_clues = \n${JSON.stringify(word_clues)}`)
	for (let word_clue of word_clues) {
		let array = (word_clue instanceof Array)
			// is already array
			? word_clue
			// is delimited string
			: word_clue.split(WordsearchGenerator.WORD_CLUE_DELIM)
		
		let word = array[0]
		let clue = word
		if (array.length == 2) {
			clue = array[1]
		}
		
		let word_n = WordsearchGenerator.string_to_array(word).length
		
		if (word_n <= Math.max(wordsearch.grid.length, wordsearch.grid[0].length)) {
			if (!wordsearch.add_word_clue(word,clue)) {
				console.log(`ERROR failed to find a place for ${word}`)
			}
		}
		else {
			console.log(
				`ERROR ${word} length ${word.length} longer than board width ${
					wordsearch.grid.length
				}`
			)
		}
	}
	
	return Promise.resolve()
}

function display_wordsearch(wordsearch, wordsearch_cmp_id) {
	let wordsearch_cmp = $(`#${wordsearch_cmp_id}`)
	console.log(`INFO display wordsearch in ${wordsearch_cmp_id}`)
	// console.log(`DEBUG final grid:\n${wordsearch.grid_string()}`)
	// console.log(`DEBUG clues:\n${wordsearch.clues.join('\n')}`)
	
	// clear endpoint_cells
	endpoint_cells = []
	
	// wordsearch element
	let wel = wordsearch_cmp.find('.wordsearch')
	.html('')
	
	// table element
	let tel = $(
		`<table></table>`
	)
	
	let y=0
	for (let row of wordsearch.grid) {
		// row element
		let rel = $(
			`<tr class="ws-row"></tr>`
		)
		
		let x=0
		for (let cell of row) {
			// cell element
			let cel = $(
				`<td class="ws-cell"
					data-x="${x}" data-y="${y}" data-word="${cell}"
					data-on="false">
					<div class="d-flex flex-column justify-content-center">
						${cell}
					</div>
				</td>`
			)
			
			cel.click(function() {
				on_cell_click(wordsearch_cmp_id, $(this), wordsearch)
			})
			
			rel.append(cel)
			x++
		}
		
		tel.append(rel)
		y++
	}
	
	wel.append(tel)
	
	display_answers(wordsearch_cmp_id, wordsearch.words, wordsearch.clues)
	
	// enable print view
	wordsearch_cmp.find('.wordsearch-print').prop('disabled', false)
	
	// update wordsearch reference
	wordsearch_global[wordsearch_cmp_id] = wordsearch
}

function display_answers(wordsearch_cmp_id, words, clues) {
	// show answer word-clues
	let answersjq = $(`#${wordsearch_cmp_id}`).find('.answers').html('')
	
	for (let i=0; i < words.length; i++) {
		let rowjq = $(
			`<li class="ws-answer" data-word-idx="${i}">
				<span class="ws-clue">${clues[i]}</span> &rarr;
				<span class="ws-word" data-found="false">${words[i]}</span>
			</li>`
		)
		
		answersjq.append(rowjq)
	}
}

function on_cell_click(wordsearch_cmp_id, cell, wordsearch) {
	let wordsearch_cmp = $(`#${wordsearch_cmp_id}`)
	// console.log(
	// 	`DEBUG cell ${cell.attr('data-x')},${cell.attr('data-y')}=${
	// 		cell.attr('data-word')
	// 	} clicked`
	// )
	
	let cell_is_on = !is_on(cell)
	cell.attr('data-on', cell_is_on)
	
	if (cell_is_on) {
		let en = endpoint_cells.length
		if (en < 2) {
			// add to endpoint_cells
			endpoint_cells.push(cell)
			en++
		}
		
		let a = endpoint_cells[0]
		let b = en == 1
			// single char word
			? a
			// multi char word
			: endpoint_cells[1]
		
		// check endpoints
		let ab = 
			`${a.attr('data-x')},${a.attr('data-y')}-`
			+ `${b.attr('data-x')},${b.attr('data-y')}`
		
		let word_idx = wordsearch.point_to_word_idx[ab]
		if (word_idx != undefined) {
			console.log(`DEBUG word ${word_idx}=${wordsearch.words[word_idx]} found`)
			a.attr('data-on',false)
			b.attr('data-on',false)
			
			// mark all word cells as found
			if (a === b) {
				a.attr('data-found',true)
			}
			else {
				let ax=parseInt(a.attr('data-x')), ay=parseInt(a.attr('data-y'))
				let bx=parseInt(b.attr('data-x')), by=parseInt(b.attr('data-y'))
				let dx=Math.sign(bx-ax), dy=Math.sign(by-ay)
			
				for (let x=ax,y=ay; x!=bx+dx || y!=by+dy; ) {
					// console.log(`.ws-cell[data-x="${x}"][data-y="${y}"]`)
					wordsearch_cmp.find(`.ws-cell[data-x="${x}"][data-y="${y}"]`)
					.attr('data-found',true)
				
					x += dx
					y += dy
				}
			}
			
			// reveal answer
			wordsearch_cmp.find(`.ws-answer[data-word-idx="${word_idx}"] > .ws-word`)
			.attr('data-found', true)
		}
		else if (en > 1) {
			// clear cells from attempt
			console.log(`DEBUG endpoints not a word`)
			for (let ec of endpoint_cells) {
				ec.attr('data-on', false)
			}
		}
		
		// clear endpoint_cells if len>=2 or single char word found
		if (en > 1 || word_idx != undefined) {
			endpoint_cells = []
		}
	}
	else {
		// clear endpoint_cells
		endpoint_cells = []
	}
}

/**
 * Handle word-clue delete button click.
 * 
 * @param {Object} event Click MouseEvent instance.
 */
function on_word_clue_delete_click(event) {
	let datetime_str = event.target.getAttribute('data-when')
	let wordsearch_cmp_id = event.target.getAttribute('data-wordsearch-id')
	// console.log(`DEBUG delete word-clue ${wordsearch_cmp_id}:${datetime_str}`)
	
	$(`#${wordsearch_cmp_id}`).find(`.word-clue[data-when="${datetime_str}"]`).remove()
}

/**
 * Handle alphabet option click.
 * 
 * @param {Object} event Click MouseEvent instance.
 */
function on_alphabet_option_click(wordsearch_cmp_id, event) {
	let alphabet_option = event.target
	let alphabet_key = alphabet_option.getAttribute('data-alphabet-key')
	console.log(`info select alphabet ${alphabet_key}`)
	
	$(`#${wordsearch_cmp_id}`).find('.language').val(alphabet_key)
}

function is_on(jq) {
	return jq.attr('data-on') === 'true'
}

/**
 * Return rem in px.
 *
 * @param {Number} rem Number of root-ems (default is 1).
 *
 * @returns Pixel size of root font character width times given rem.
 * @type Number
 */
function rem_to_px(rem = 1) {
	let rem_px_str = $(document.documentElement).css('fontSize')
	console.log(`DEBUG rem in px = ${rem} * ${rem_px_str}`)
	return rem * parseFloat(rem_px_str)
}

function unescape_backslashes(str) {
	// parse \\. as \.
	// each item is [match, ...groups] w index property
	let escapes = str.matchAll(/\\(.)/g)
	
	let arr = [...str]
	let delta = 0
	for (let escape of escapes) {
		let char = ESCAPE_CHAR[escape[1]]
		// replace escaped escape char with escaped char
		arr.splice(escape.index + delta, 2, char)
		delta -= 1
	}
	
	return arr.join('')
}
