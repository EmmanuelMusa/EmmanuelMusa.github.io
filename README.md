# Emmanuel Musa

My portfolio, live at https://emmanuelmusa.github.io/

It is one page of plain HTML, CSS and JavaScript with no build step and no dependencies.

Fig. 1 at the top of the page is the record of a real test run from my own work: the latest run of Ask JAMIE's test set. The rows live in `assets/js/run.js` and every number the figure shows is worked out from them by `assets/js/run-figure.js`. It is a recorded result. Nothing is run in the visitor's browser.

The page has a dark theme and a light theme. Light is the default. The switch is in the header and the choice is kept in the browser.

## Releasing a change

Browsers keep copies of stylesheets and scripts. So that a visitor never sees a new page with an old stylesheet, every local stylesheet and script address carries a version, for example `assets/css/style.css?v=7`.

Raise it on every release: search the folder for `?v=7` and replace every one with the next number. They are in `index.html`, `404.html` and in the `import` lines at the top of the files in `assets/js`. The tests fail if any is missed or if two versions are mixed.

## Run it locally

```
python -m http.server 4173
```

Then open http://localhost:4173

## Tests

```
node --test tests/
```
