# Havisu PDF interface inventory

This inventory supplements the [103 processing capabilities](ACCEPTANCE-MATRIX.md). Each control identifier is scoped to the routes listed. Where values are enumerated, append the value to the identifier to identify an individual choice, such as `split.mode/individual` or `mark.position/bottom-right`. Repeated controls use the document, page, or field index as their suffix.

The test names refer to Playwright specs under `tests/e2e`. The [audit report](UI-AUDIT.md) records fresh run results and limits. October's processing baseline remains separate.

| ID | Surface, controls and values | Expected behavior | Evidence |
| --- | --- | --- | --- |
| site.skip | Skip to content on all pages | Keyboard focus and activation reach main content | UI-LINKS |
| site.brand | Header and footer brand links | Navigate home with an accessible product name | brand, SEO |
| site.navigation | Tools, How it works, Privacy | Reach the corresponding homepage anchors | UI-LINKS, mobile |
| site.menu | Open/close mobile navigation, Escape | Announce expansion, move keyboard focus into the menu and restore it on Escape | UI-NAV |
| site.theme | Light and dark toggle, persisted choice, system fallback | Correct icon and label, readable colors, consistent reload, reduced motion | brand, parity, preservation |
| site.install | Prompt, manual, iOS guidance, macOS guidance, unavailable | Present the appropriate install action and restore focus after dismissal | install |
| site.offline | Offline/online notice | Announce loss of network and clear the notice when restored | experience, hardening |
| site.update | Waiting update, blocked while editing, activate | Retain workspace until reset and explicit activation | recovery |
| site.recovery | Reload, Back to tools | Escape missing chunks and recover on reload | recovery |
| site.footer | All tools, usage analytics, alternative page | Reach matching content without document data in the URL | UI-LINKS, SEO |
| site.404 | Unknown routes and Explore tools | Genuine 404 with working return link | SEO, check-hosting |
| home.hero | Primary and secondary homepage links | Reach the tools and privacy sections | UI-LINKS |
| home.search | Input, slash shortcut, clear, no results | Match tool metadata, recover from no matches | UI-SEARCH, experience |
| home.category | All tools, Organize, Convert, Optimize, Edit & sign, Security | Only matching cards appear and selected category is announced | UI-SEARCH |
| home.card | Twelve tool cards | Each opens its named workspace | mobile, SEO |
| home.faq | Each question disclosure | Toggle the answer by pointer or keyboard | UI-LINKS, experience |
| comparison.links | Workspace, tool and source links on the comparison page | Correct accessible targets and canonical content | SEO, UI-PUBLIC |
| tool.guide | Breadcrumb, FAQ, related tools, return to all tools | Navigate among the fourteen routes and read each guide | UI-LINKS, SEO, UI-REVIEW |

| ID | Shared workspace controls and states | Expected behavior or output assertion | Evidence |
| --- | --- | --- | --- |
| work.select | Choose a PDF, Choose PDFs, Choose images, native picker | Accept the route's supported sources. Keep keyboard focus on the visible chooser | UI-FILE, tools, UI-MOBILE |
| work.drop | Drag-over, leave, drop, invalid drop, admission busy | Highlight the drop target, reject invalid data, allow a valid retry | UI-REVIEW, resources |
| work.steps | Select files, Configure, Download | Announce a single current step as the workflow advances | UI-REVIEW |
| work.help | Tool help, Got it, close, Escape | Accessible dialog, trapped focus and return to opener | UI-DIALOG |
| work.error | Alert, dismiss, invalid settings, cancelled state | Explain the failure without losing valid inputs or settings | UI-REVIEW, release-workflows |
| work.add | Add files | Append admitted files without replacing retained sources | release-workflows, tools |
| work.clear | Clear all files, Start fresh | Clear previews, settings, worker handles, and results | release-workflows, UI-MOBILE |
| work.remove | Remove file, Remove active document | Remove the matching source and its pages | hardening, experience |
| work.active | Active document selection | Preview and edit the selected source with its own page count | split-workflows, parity |
| work.grid | Page grid, large preview, numbered thumbnail | Switch preview modes while preserving the active source and ranges | UI-VIEW, split-workflows, UI-REVIEW |
| work.page-nav | Previous/next page and disabled endpoints | Display the corresponding page and position | UI-VIEW, hardening |
| work.file-preview | Preview file, previous/next file page, close | Display original pages in a dialog and restore focus | UI-DIALOG |
| work.file-order | Drag handle, earlier/later buttons, first/last disabled | Export in the chosen file order | tools, mobile |
| work.file-rotate | Rotate file, rotate active document | Apply rotation only to the chosen source | parity, control-matrix |
| work.password | Current password, Open PDF locally, Escape, close, retry | Unlock with valid credentials, return focus after dismissal, reopen the same file | UI-FILE, unlock-compatibility |
| work.settings | Settings & export, Hide settings, disclosure state | Expose controls at narrow widths without covering the file picker | UI-SETTINGS, UI-REVIEW, UI-MOBILE |
| work.process | Tool-specific primary action, disabled/loading, progress | Submit once when enabled, announce progress and retain local files | UI-REVIEW, resources |
| work.cancel | Cancel processing | Cancel active work and prevent stale or partial output publication | release-workflows, experience |
| work.download | Single file, ZIP, partial batch, all failed, individual status | Correct names and contents. All failed shows attention and stays on Configure | UI-MOBILE, UI-REVIEW, UI-BATCH-FAILED, recovery |
| work.original | Keep original file on Compress | Download the input bytes and filename | compression, UI-ORIGINAL |
| work.adjust | Adjust settings | Reveal settings, restore editing focus and allow another export | UI-SETTINGS, UI-MOBILE |
| work.preview-fit | Empty, configured, processing, invalid, cancelled, result, password | No horizontal overflow or blocked primary actions at tested sizes | UI-REVIEW, UI-ZOOM, recovery |

| ID | Tool controls, values and conditional states | Expected output or interaction | Evidence |
| --- | --- | --- | --- |
| merge.sort | Sort A–Z | Exact alphabetical page order | parity |
| merge.preview | Each file card, ordering, rotation and removal | Combined content, order and structure | tools, compatibility, preservation |
| split.mode | Individual, extract, custom ranges, fixed groups, maximum size | Separate/combined outputs and actual ZIP entries | split-workflows, parity, release-contract |
| split.pages | Page ranges, inclusion checkboxes | Preview and exported page selection agree | split-workflows, tools |
| split.groups | Semicolon groups, combine all groups checkbox | Separate groups or one combined document | split-workflows |
| split.fixed | Pages per file | Group size and remainder | parity |
| split.bytes | Maximum KiB and allow image compression checkbox | Measured output ceiling, explicit compression, oversized single-page error | parity, release-contract |
| compress.mode | Preserve text, image optimization, page rasterization | Correct modes, reduction or exact original fallback | tools, compression, parity |
| compress.level | Image quality 90/75/50, raster image quality range | Preset conversion without accidental rasterization | parity, compression |
| organize.add-blank | Add blank page | A4 blank in output at selected order | parity |
| organize.page | Select all, individual select, earlier/later, drag, rotate, duplicate, remove | Correct references, order and independent annotations | tools, compatibility |
| organize.history | Undo, redo, import after undo | Accurate history and preserved new files | release-workflows, parity |
| organize.extract | Extract selected | Correct selected pages and navigation | tools, preservation |
| rotate.range | Pages, all/portrait/landscape target | Only intended pages rotate | tools, control-matrix |
| rotate.angle | 90°, 180°, 270°, per-page and document rotation | Exact page rotations | control-matrix, parity |
| rotate.reset | Reset rotation settings and Reset all | Restore the corresponding controls | control-matrix |
| images.output | Combined or separate | One PDF or named PDF ZIP | tools, parity |
| images.size | A4, Letter, original, portrait/landscape, margins, contain/cover | Exact boxes and visible image fit | control-matrix, hardening |
| images.source | PNG, JPEG, WebP, transparency, EXIF, ordering, rotation | Correct orientation and image content | tools, hardening, parity |
| convert.mode | Render or extract, selected pages | Page pixels or native embedded images, recover empty extraction | control-matrix, release-workflows |
| convert.format | PNG/JPEG, 72/144/216 DPI for render, JPEG quality | Correct encoding, dimensions, background and names | control-matrix, hardening |
| mark.mode | Text or image, artwork selection and width | Correct artwork and scale, active options only | parity, control-matrix, page-selection unit |
| mark.text | Text, size, opacity, angle, color | Independently rendered text and placement | hardening, control-matrix |
| mark.layer | Above/below content, tiled repetition | Correct layering and repeated placement | parity, control-matrix |
| mark.position | Top/middle/bottom × left/center/right, drag, arrow/Shift+arrow | Named, pressed presets and matching preview/export placement | UI-POSITION, hardening |
| mark.appearance | Typography disclosure, sans/serif/mono/signature, bold, italic, shadow, background and color | Correct glyphs and appearance | control-matrix, hardening |
| numbers.counter | Start counter, Pages, first-page cover, facing pages, margin | Exact counter, placement and exclusion | control-matrix, hardening |
| numbers.style | Plain number, Page, total, custom, template tokens | Exact text, no inactive-template interference | control-matrix, page-selection unit |
| numbers.appearance | Size, opacity, color, position, shared typography | Correct style and geometry on cropped pages | control-matrix, hardening |
| protect.opening | New password and confirmation | Correct AES-256 result, reject mismatch and invalid length | tools, hardening |
| protect.advanced | Advanced disclosure, permission controls, require opening password, owner password and confirmation | Opening-password and permissions-only results | parity |
| protect.permissions | Printing, copying, content editing, comments, form filling, assembly | Independent permission-bit assertions | control-matrix |
| unlock.admission | Reader/owner/empty password, wrong password retry, batch credentials | Unencrypted output with preserved text and forms | unlock-compatibility, parity, UI-FILE |
| sign.artwork | Draw/type/upload, clear, color, name, font, remove upload | Actual artwork and safe formats, correct preview | tools, parity, hardening |
| sign.place | Page ranges, width, position, drag and keyboard | Verified placement and page membership | hardening, parity |
| sign.field-kind | Disclosure, signature/initials/name/date/text/stamp, Add field, active field | Independent field targets and announced selection | control-matrix, UI-SIGN-FIELDS |
| sign.field-edit | Field text or replacement artwork, pages, horizontal/vertical position, width, rotation, opacity, typography, size/color | Edit the chosen field and independently check output | control-matrix, parity |
| sign.history | Duplicate/delete field, Undo/Redo field change | Correct field state and output membership | parity, control-matrix |

Release disposition is recorded by test and surface in [UI-AUDIT.md](UI-AUDIT.md). Desktop engines verify the shared behavior. Mobile Chromium covers every export workflow. The dedicated Chromium review covers screenshots, Axe, narrow layouts and native zoom. Physical devices and the existing unsupported document types remain separate qualification areas.
