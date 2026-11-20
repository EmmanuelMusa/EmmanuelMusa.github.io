# Emmanuel Musa

My portfolio, live at https://emmanuelmusa.github.io/

It is one page of plain HTML, CSS and JavaScript with no build step and no dependencies.

Two things on the page are real machine learning running in your browser:

- A small neural network that trains live on a 2D dataset (`assets/js/nn.js`, drawn by `assets/js/hero.js`).
- An n-gram model that trains on the page's own text and suggests the next word (`assets/js/ngram.js`, used by `assets/js/predictor.js`).

## Run it locally

```
python -m http.server 4173
```

Then open http://localhost:4173

## Tests

```
node --test tests/
```
