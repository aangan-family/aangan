# Check the family words for your language

Every community pack on the site is a careful first draft. Words change from region to region, caste to caste and religion to religion, so we need people who speak each language at home to check them. **You don't need to code.**

## How to help (about 30 minutes)

1. Download the sheet for your language below (on GitHub: open the file → **Download raw file**). It opens in Excel or Google Sheets (File → Import).
2. Each row is one relationship, with the word the site uses now, in English letters and in your script. "Who is speaking" matters where a man and a woman use different words.
3. For each row, write **Yes**, **No** or **Depends** in the *Correct?* column. If it's wrong or missing, write the word your family uses, in both English letters and your script.
4. *Where or who says it differently* is for variants: "In Madurai we say …", "Iyengar families say …", "Muslim families in Hyderabad say …". Variants are welcome: they help us add regional packs later.
5. At the bottom are the menus and labels (Home, Family tree, Calendar…). Check those too.
6. Send it back: open a [Family words issue](../../../../issues/new?template=family-words.yml) and attach the sheet, or email it to the project maintainers.

Please write only words, never anyone's names or details. Your name goes in the table below only if you'd like it to.

## The sheets

| Language | Sheet | Words missing | Reviewed by |
| --- | --- | --- | --- |
| Hindi | [hindi.csv](hindi.csv) | 0 | Not yet |
| Punjabi | [punjabi.csv](punjabi.csv) | 4 | Not yet |
| Bengali | [bengali.csv](bengali.csv) | 12 | Not yet |
| Marathi | [marathi.csv](marathi.csv) | 10 | Not yet |
| Gujarati | [gujarati.csv](gujarati.csv) | 11 | Not yet |
| Urdu | [urdu.csv](urdu.csv) | 4 | Not yet |
| Tamil | [tamil.csv](tamil.csv) | 6 | Not yet |
| Telugu | [telugu.csv](telugu.csv) | 8 | Not yet |
| Kannada | [kannada.csv](kannada.csv) | 8 | Not yet |
| Malayalam | [malayalam.csv](malayalam.csv) | 20 | Not yet |

A pack counts as reviewed once two people from different regions or communities have checked it.

## For maintainers

The sheets are made from `web/src/lib/community/packs.ts` by `cd web && npm run review-kit`; the website's tests fail if a pack changes and the sheets aren't remade. To apply a review: change the words in `packs.ts` (see CONTRIBUTING.md), run `npm run review-kit`, and update the table above.
