Authoring sources for the Learning Institute. The courses are written in c001.py, c002.py, enrich.py and extra.py.
`python3 build_li.py <repo root>` validates every link and source against the site's real records, writes
learning-institute/data/*.json and the static course pages. app.js and activities.js are copied to /learning-institute/.
t_li.py and t_a11y.py are the browser tests (Playwright). Paths inside them reflect the original build machine.
