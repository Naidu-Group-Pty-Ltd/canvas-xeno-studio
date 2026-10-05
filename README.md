# Spark Studio

MASTER BUILD INSTRUCTION — INTERNAL AI CREATIVE STUDIO

Build this application end-to-end. Do not merely create a visual prototype or mock interface. Implement the frontend, database, authentication, storage architecture, Supabase Edge Functions, Higgsfield integration layer, asynchronous generation lifecycle, asset ingestion, project management, model registry, activity tracking, usage tracking, error handling and production-ready UX described below.

Do not stop after scaffolding individual sections. Work systematically through the entire specification and implement as much as technically possible in this build.

If an external credential is required, build the complete functionality around it and surface a clear configuration state rather than replacing the functionality with mock data.

Do not repeatedly ask me implementation questions. Use sensible engineering defaults where necessary and continue executing.

1. PRODUCT PURPOSE

Build an internal web application for our team that functions as our own AI image/video creative generation studio.

Working title:

Xeno Studio

Make the application name configurable so it can easily be renamed later.

The application uses the Higgsfield API as its initial generation provider.

The purpose is to allow our internal team to generate images and videos through the Higgsfield API without using the normal Higgsfield interface or subscription product.

The application's architecture must be designed so that additional providers can eventually be added without rebuilding the frontend.

Future providers might include:

OpenAI

Google

Fal

Replicate

direct model APIs

However, ONLY implement Higgsfield now.

The architecture should therefore be:

Frontend
→ Internal generation abstraction
→ Provider adapter
→ Higgsfield API

Do not tightly couple frontend components directly to Higgsfield-specific API logic.

2. PRODUCT TYPE

This is an INTERNAL TEAM TOOL.

It is NOT:

a customer-facing SaaS

a public app

a reseller of API access

a subscription product

an ecommerce system

Do NOT build:

Stripe

customer subscription plans

public pricing pages

customer billing

credit packages

checkout

trials

public registration

customer organizations

public API access

referral systems

We only require internal authentication, internal usage tracking and internal cost visibility.

3. TECHNOLOGY STACK

Use Lovable's normal production-quality architecture.

Preferred:

Frontend:

React

TypeScript

Tailwind CSS

shadcn/ui

Lucide icons

Backend:

Supabase

Use Supabase for:

authentication

PostgreSQL database

Row Level Security

Storage

Edge Functions

Realtime status updates

Keep Higgsfield credentials exclusively server-side.

NEVER expose Higgsfield credentials in:

frontend code

browser requests

localStorage

client environment variables

database records readable by normal users

Use Supabase secrets for:

HF_KEY_ID

HF_KEY_SECRET

The server should construct:

Authorization: Key {HF_KEY_ID}:{HF_KEY_SECRET}

Base Higgsfield API:

https://api.higgsfield.ai

Abstract this into a provider configuration rather than scattering URLs throughout the application.

4. VISUAL DESIGN

Create an original interface.

DO NOT visually clone Higgsfield.

We are borrowing good workflow concepts, not their trade dress.

Design language:

premium AI creative workstation

professional

cinematic

minimal

highly polished

dense enough for power users without feeling cluttered

desktop-first but properly responsive

Primary palette:

near black

graphite

dark charcoal

white/off-white typography

electric red accent #FF0000

Use the red accent deliberately rather than excessively.

Avoid a generic startup dashboard appearance.

The Create page should feel like a genuine creative workstation.

Use:

strong typography hierarchy

clean cards

subtle borders

restrained shadows

tasteful micro-interactions

skeleton loaders

smooth tab transitions

clear hover states

tooltips

beautiful empty states

status badges

professional modals

Use Lucide icons rather than emoji.

5. APPLICATION NAVIGATION

Create a persistent left sidebar containing:

Create

Projects

Assets

Activity

Models

Usage

Settings

Default route after authentication:

Create

The sidebar should be collapsible.

Top header should include:

current project if relevant

API/provider health indicator

active generation count

user profile/avatar menu

logout

optional global asset/project search

6. AUTHENTICATION

Use Supabase Auth.

This is an internal closed system.

Implement:

login

password reset

session persistence

logout

No open/public registration screen.

Create a profiles/team_members system.

Roles:

admin

member

Fields:

id
email
full_name
avatar_url
role
is_active
created_at
updated_at

An authenticated Supabase user must ALSO have an active profile to access the application.

Admins can:

access settings

manage model availability

manage team members

change system defaults

Members can:

create generations

use projects

use assets

see team activity

see usage data

All internal users share the same workspace.

This is not a multi-tenant application.

7. DATABASE ARCHITECTURE

Create proper migrations and RLS for the following entities.

profiles

id uuid references auth.users
email
full_name
avatar_url
role enum admin/member
is_active boolean default true
created_at
updated_at

projects

id uuid
name
description
created_by
is_archived boolean default false
created_at
updated_at

Projects are team-shared.

asset_folders

id
project_id nullable
parent_id nullable
name
created_by
created_at
updated_at

Allow simple folder organization.

Nested folders are acceptable if straightforward.

model_registry

This is extremely important.

Do NOT hardwire model-specific UI logic all over the frontend.

Fields:

id
provider
family
display_name
description
model_path
output_type
operation
capabilities jsonb
parameter_schema jsonb
ui_schema jsonb
default_parameters jsonb
recommended_for
is_active
sort_order
created_at
updated_at

Provider initially:

higgsfield

Possible operations:

text-to-image
image-to-image
text-to-video
image-to-video
reference-to-video
video-to-video
video-extend

The Create interface must dynamically render controls from the selected model's registry schema.

generations

Fields:

id
user_id
project_id nullable
model_registry_id
parent_generation_id nullable

provider
model_path
operation

prompt
parameters jsonb

estimated_cost_usd numeric nullable
actual_cost_usd numeric nullable
cost_source nullable

status

hf_request_id nullable
hf_status_url nullable
hf_cancel_url nullable

provider_response jsonb nullable

error_code nullable
error_message nullable

submission_started_at nullable
submitted_at nullable
started_at nullable
completed_at nullable

ingest_status

created_at
updated_at

Supported application generation states:

draft
estimating
ready
local_queued
submitting
submission_uncertain
queued
in_progress
completed
failed
nsfw
canceled

Ingest states:

not_required
pending
processing
completed
failed

generation_inputs

id
generation_id
asset_id nullable
input_type
position
storage_bucket
storage_path
hf_public_url nullable
metadata jsonb
created_at

Input types may include:

image
video
audio
first_frame
last_frame
reference

assets

id
generation_id nullable
project_id nullable
folder_id nullable
uploaded_by
asset_type
source_type
title
storage_bucket
storage_path
mime_type
width nullable
height nullable
duration_seconds nullable
file_size nullable
is_favorite boolean
metadata jsonb
created_at
deleted_at nullable

source_type:

generated
uploaded

asset_type:

image
video
audio

Audio support here is for reference inputs even though standalone audio generation is not currently part of V1.

generation_events

id
generation_id
event_type
payload jsonb
created_at

Record important lifecycle events including:

created
estimate_requested
estimate_received
submission_started
provider_accepted
queued
in_progress
completed
webhook_received
asset_ingest_started
asset_ingest_completed
failed
canceled
submission_uncertain

This table should provide an audit/debug trail.

usage_ledger

id
generation_id
user_id
model_registry_id
estimated_cost_usd
actual_cost_usd nullable
billing_status
created_at

Never fabricate actual cost if the API doesn't return it.

If only an estimate is known, clearly label the value as estimated.

app_settings

Implement configurable settings including:

default_image_model
default_video_model
max_provider_concurrency
require_cost_estimate
high_cost_warning_usd
provider_enabled
asset_retention_mode

Defaults:

max_provider_concurrency = 15
require_cost_estimate = true
high_cost_warning_usd = 2.00
provider_enabled = true

8. ROW LEVEL SECURITY

Implement proper RLS.

Only authenticated ACTIVE team members may access normal application data.

Team content is shared across active users.

Members can:

view/create generations

view/create/update projects

view/create assets

view activity

view usage

manage their own account data

Admins additionally control:

team membership

model_registry changes

app_settings

Never expose Supabase service role credentials to the frontend.

Storage buckets must also be protected.

9. STORAGE

Create private Supabase Storage buckets for:

generation-inputs

generated-assets

Store permanent copies of all important inputs and generated outputs.

Do not rely on Higgsfield URLs for permanent retention.

Use logical paths similar to:

projects/{project_id}/inputs/{uuid}.jpg

projects/{project_id}/outputs/{generation_id}/{uuid}.mp4

For generations without projects:

unassigned/{user_id}/...

Use signed URLs for private frontend viewing.

10. HIGGSFIELD PROVIDER ADAPTER

Create a clean server-side adapter/service.

Conceptually:

GenerationProvider

Methods:

estimate()
submit()
getStatus()
cancel()
prepareMedia()
normalizeResult()

Then:

HiggsfieldProvider implements GenerationProvider.

Keep provider-specific code isolated.

11. HIGGSFIELD AUTHENTICATION

All requests occur server-side.

Use:

Authorization: Key KEY_ID:KEY_SECRET

Use:

Content-Type: application/json

Never allow frontend code to directly call authenticated Higgsfield generation endpoints.

12. ASYNCHRONOUS GENERATION ARCHITECTURE

Do NOT hold a browser request open until video generation completes.

Do NOT use a long-running frontend polling request.

Generation flow:

User
→ frontend
→ Supabase Edge Function
→ validate parameters
→ prepare references
→ request cost estimate
→ create/update generation
→ submit Higgsfield request
→ receive request ID
→ store request information
→ return immediately to browser

Generation continues asynchronously.

Higgsfield webhook/recovery mechanism updates database.

Supabase Realtime updates frontend.

Expected provider states:

queued
in_progress
completed
failed
nsfw
canceled

Map them to our application status.

13. WEBHOOK ARCHITECTURE

Create public Supabase Edge Function:

higgsfield-webhook

When submitting a request, attach the webhook URL through Higgsfield's supported webhook mechanism.

Webhook handler must:

validate payload structure

identify request_id

find matching generation

be idempotent

tolerate duplicate deliveries

store provider payload

update terminal status

insert generation_event

set output ingestion to pending when completed

return quickly

Do NOT repeatedly create assets if the webhook is delivered twice.

Use request ID + state + output identity for idempotency.

Do not perform huge video downloads before responding to the webhook if this risks function timeout.

Instead flag assets for ingestion and process them separately.

14. OUTPUT INGESTION

Build:

higgsfield-ingest-outputs

Completed Higgsfield results must be copied into our own Supabase Storage.

Normalize provider output because image models may return arrays of images while video models may return a video object.

Process:

provider output URL
→ fetch server-side
→ determine MIME type
→ save to generated-assets
→ create assets record
→ associate asset with generation/project
→ mark ingest complete

Never depend permanently on the external result URL.

Handle multi-image outputs correctly.

For example, Soul batch generation can create multiple image assets from one generation.

15. RECOVERY POLLING

Webhooks are the primary completion mechanism.

Also implement recovery polling for reliability.

Create:

higgsfield-reconcile

It should periodically inspect non-terminal generations and query Higgsfield status for jobs that appear stale or whose webhook may have been missed.

Use request IDs/status URLs stored in generations.

Do not hammer the API.

Use appropriate backoff and timestamps.

When terminal results are discovered:

update generation

record event

trigger/set output ingestion pending

If Lovable cannot directly schedule Supabase cron during the initial build, create the function correctly and clearly tell me the single scheduling step required afterward.

Do not omit the recovery functionality.

16. SUBMISSION SAFETY / DUPLICATE CHARGES

This is critical.

Do NOT blindly retry a generation POST when the result of the original submission is uncertain.

Implement our own submission lock.

When user presses Generate:

ready
→ submitting

Immediately disable further submission.

Create a unique generation record before provider submission.

If Higgsfield accepts:

submitting
→ queued/in_progress

If a clear rejection occurs:

→ failed

If the network times out or response is ambiguous and we cannot know whether Higgsfield accepted the request:

→ submission_uncertain

Do NOT automatically resubmit submission_uncertain.

Surface:

"Submission status is uncertain. Automatic retry is disabled to prevent accidental duplicate generation charges."

An admin/user may manually choose:

"Resubmit anyway"

after confirmation.

The resubmission must create a NEW generation record linked using parent_generation_id.

Also debounce/disable Generate to protect against double-clicks.

17. COST ESTIMATION

Before final generation submission, call Higgsfield's estimate functionality using the same model path and parameters.

Never hardcode model pricing into the generation engine.

Prices change.

Store:

estimated_cost_usd

Display it prominently near Generate:

Estimated cost: $X.XX

When generation parameters change, invalidate the previous estimate.

Recalculate using a short debounce rather than on every keystroke.

If:

require_cost_estimate = true

then Generate must not be available until a valid estimate exists.

If estimated cost exceeds:

high_cost_warning_usd

show an additional confirmation:

"This generation is estimated to cost $X.XX."

Do not make the warning annoying for normal inexpensive generations.

18. MEDIA INPUT FLOW

Users should be able to drag/drop or browse for reference files.

Support:

JPEG
PNG
WebP
GIF where appropriate
MP4
MOV where appropriate
WAV where appropriate

Validate model-specific requirements.

Reference media must first be retained in our own Supabase storage.

When Higgsfield requires an accessible media URL, use its supported media upload/presigned URL process server-side.

Implement a helper such as:

prepareHiggsfieldMedia(asset)

that:

retrieves the internal asset

asks Higgsfield for its supported upload destination

uploads the bytes

receives the public media URL

stores that URL on generation_inputs

passes that URL to the model request

Reuse an already prepared URL for that generation when safe rather than uploading the same source repeatedly.

19. INITIAL MODEL REGISTRY

Seed V1 with the following model routes.

Organize them by model family in the UI, while treating each API operation as a separate registry capability where necessary.

IMAGE — SOUL 2

Display:

Soul 2

Provider:

Higgsfield

Model path:

higgsfield-ai/soul/v2/standard

Operation:

text-to-image

Inputs:

prompt required

Parameters:

seed:
optional integer
1–1,000,000

style_id:
optional string
advanced setting

batch_size:
1 or 4
default 1

resolution:
720p
1080p
default 720p

aspect_ratio:
9:16
16:9
4:3
3:4
1:1
2:3
3:2

default:
4:3

enhance_prompt:
boolean
default true

Render appropriate fields dynamically.

20. IDEOGRAM 4

Display:

Ideogram 4

Path:

ideogram/v4.0

Operations:

text-to-image
image-to-image

Prompt:
required
2–2048 chars

Optional image input:

image_url

Parameters:

aspect_ratio options:

1:1
1:2
2:1
2:3
3:2
4:5
5:4
9:16
16:9
5:8
8:5
3:4
4:3
9:22
22:9
9:23
23:9
3:8
8:3
5:12
12:5
1:3
3:1

default:
1:1

image_weight:
1–100
only show when image reference supplied

rendering_speed:

TURBO
DEFAULT
QUALITY

default DEFAULT

21. MARKETING STUDIO IMAGE

Display:

Marketing Studio Image

Path:

marketing-studio/image

Operations:

text-to-image
image-to-image / campaign edit

Parameters:

prompt
required

image_urls
optional
support multiple references

resolution:

1k
2k
4k

default 2k

aspect_ratio:

auto
1:1
3:2
2:3
4:3
3:4
16:9
9:16
21:9

default auto

enhance_prompt:
boolean

quality:
support when accepted by current API configuration

moderation:
default auto where supported

IMPORTANT:

When enhance_prompt = false:

direct generation/edit mode.

When enhance_prompt = true:

retrieve CURRENT Marketing Studio presets from the provider server-side.

Do NOT hardcode preset UUIDs.

Create Edge Function:

higgsfield-marketing-presets

Fetch current preset pages, including cursor pagination if required.

Present the presets in a visual/selectable frontend control.

Enhanced mode requires:

preset selection

product/reference image as required by provider

Support optional second model/reference image where supported.

22. WAN 3 VIDEO

Display:

Wan 3.0

Path:

alibaba/wan-3.0/text-to-video

Operation:

text-to-video

Parameters:

prompt required

seed:
0–2147483647
optional

duration:
2–30 seconds
default 5

resolution:

480p
720p
1080p

default:
1080p

aspect_ratio:

16:9
4:3
1:1
3:4
9:16
adaptive

default:
adaptive

generate_audio:
boolean
default true

enable_thinking:
boolean
default false

Place enable_thinking under Advanced Settings.

23. KLING 3 VIDEO

Seed the Standard route first.

Display:

Kling 3.0 Standard

Text-to-video path:

kling-video/v3.0/std/text-to-video

Also support its corresponding image-to-video operation:

kling-video/v3.0/std/image-to-video

Render parameters according to the operation.

Core controls include:

prompt
duration
sound
CFG scale
aspect ratio
multi-shot where supported
multi-prompt where supported
image/reference input for image-to-video

Keep Kling configuration isolated inside the model registry.

Do not implement random API fields not described by the model schema.

Allow future addition of:

Kling Pro
Kling Turbo
Kling 4K

without changing Create page components.

24. SEEDANCE 2.5

Display:

Seedance 2.5

Support multiple API operations.

Text-to-video

Path:

bytedance/seedance-2.5/text-to-video

Parameters:

prompt required

duration:
4–30
default 5

resolution:
480p
720p

default 720p

aspect_ratio:

16:9
4:3
1:1
3:4
9:16
21:9

default 16:9

output_format:

mp4
mov

default mp4

generate_audio:
boolean
default true

Image-to-video

Path:

bytedance/seedance-2.5/image-to-video

Require source image.

Expose relevant supported prompt, duration, resolution, end-frame and audio settings.

Reference-to-video

Path:

bytedance/seedance-2.5/reference-to-video

Support reference:

images
videos
audio

The model can receive multiple media references.

Parameters should include:

prompt
duration
audio_urls
image_urls
video_urls
resolution
aspect_ratio
output_format
generate_audio

Video Extend

Path:

bytedance/seedance-2.5/video-extend

Require source video.

Expose the model's supported extension parameters dynamically.

25. MODEL REGISTRY PRINCIPLE

This is essential.

The Create page must NOT contain architecture like:

if model === "wan"
if model === "kling"
if model === "seedance"

throughout numerous components.

Instead:

selected model
→ parameter_schema
→ UI field renderer
→ validation schema
→ request serializer

A field schema should be able to describe controls such as:

text
textarea
number
slider
select
boolean
media
multi-media
seed
duration
aspect ratio
resolution

Support:

required
min
max
options
default
advanced
dependency visibility

Example:

image_weight should only display when image input exists.

preset_id should only display when Marketing Studio enhancement is enabled.

This system is foundational because we expect models to change frequently.

26. CREATE PAGE

This is the most important screen.

Create a highly polished creator workspace.

Top area:

IMAGE | VIDEO

Changing the primary media type filters available models.

Then:

Model selector

Operation selector if model supports multiple operations.

Project selector.

Reference inputs.

Prompt composer.

Model parameters.

Advanced Settings.

Cost estimate.

Generate.

Suggested layout:

LEFT/CENTER:
creative input workspace

RIGHT:
settings/model controls

BOTTOM:
recent generation results

or another strong desktop layout if superior.

27. MODEL SELECTOR

Build a proper model browser/modal.

Allow:

search
filter by output type
filter by provider
filter by operation

Cards should display:

model name
provider
image/video
supported operation
short "best for" description

Examples:

Soul 2
"Fast creative image generation"

Ideogram 4
"Typography, design and high-quality image creation"

Marketing Studio
"Product and campaign creative"

Wan 3
"Flexible general video generation"

Kling 3
"High-quality cinematic motion"

Seedance 2.5
"Advanced long-form and reference video"

Do not hardcode price labels because generation cost depends on current API pricing/settings.

28. PROMPT COMPOSER

Large premium textarea.

Features:

multiline

character count

automatically save current draft locally

clear

duplicate previous prompt

load prompt from previous generation

keyboard shortcut for Generate where appropriate

Do not clutter it with unnecessary AI prompt rewriting in V1.

Keep the architecture ready for prompt assistants later.

29. REFERENCE MEDIA RAIL

Create a polished reference/media component.

Features:

drag and drop

browse

thumbnails

video preview

reorder references

remove

identify input role

validation

upload progress

Potential roles:

Source
Reference
First Frame
Last Frame
Audio

Only display roles allowed by selected model.

30. PARAMETER UI

Keep common controls visible.

Examples:

aspect ratio
resolution
duration
audio
batch count

Put less-common controls in:

Advanced Settings

Examples:

seed
CFG
thinking
rendering speed
image weight

Use intelligent component types:

aspect-ratio visual buttons
resolution segmented controls
duration slider/input
boolean switches
numeric sliders
selects

31. LIVE ESTIMATE

Near Generate:

Estimated cost
$0.00

States:

Calculating…
$0.XX
Estimate unavailable
Parameters incomplete

Generate must clearly communicate why it is disabled.

Do not use arbitrary hardcoded prices.

32. GENERATION BUTTON

Use a visually strong primary action.

Possible display:

Generate · ~$0.42

Once clicked:

lock immediately

show submission state

insert generation into Activity

return control to user quickly

generation continues asynchronously

Do NOT keep the full page locked while generation happens.

The user should be able to start another generation.

33. RECENT OUTPUTS

Show recent outputs beneath/alongside Create.

Image:
thumbnail grid

Video:
poster/inline preview

Each asset should support quick actions:

Open
Download
Favorite
Use as Reference
Recreate
Create Variation
Animate / Image to Video where applicable
Move to Project
Move to Folder

34. RECREATE

Recreate should load:

same model
same operation
same prompt
same parameters
same reference assets where available

into Create.

Do NOT immediately charge/generate.

Let the user review and press Generate.

35. CREATE VARIATION

Create a new generation draft linked through:

parent_generation_id

Load prior settings.

Allow user to modify prompt/settings.

36. IMAGE → VIDEO

When viewing an image asset:

button:

Animate

Clicking it should:

navigate to Create

switch to Video

preload the image as source/reference

select default image-to-video model

allow model change

preserve project context

This workflow is important.

37. PROJECTS PAGE

Projects act as campaign/workspace containers.

Grid/list toggle.

Each project card:

name
description
asset count
recent asset preview
last activity
created by

Actions:

Open
Rename
Archive

Project detail:

Assets
Generation History
Folders
Project metadata

Add:

New Project

Do not permanently delete a project immediately.

Use archive by default.

38. ASSETS PAGE

Build a strong media library.

Features:

Grid/List toggle

Filters:

All
Images
Videos
Uploaded
Generated
Favorites
Project
Model
Creator

Search by:

asset title
prompt
project

Sorting:

Newest
Oldest
Favorites

Asset cards should not crop important image content unnecessarily.

Use contained preview where needed.

Video cards should have proper playback/modal preview.

39. ASSET DETAIL

Open assets in a large modal/drawer or detail view.

Display:

full preview
asset type
project
folder
created by
created at
model
generation status
prompt
generation parameters
estimated cost
resolution/duration metadata where available

Actions:

Download
Favorite
Use as Reference
Recreate
Create Variation
Animate
Move
Delete

Generated asset details should link back to the originating generation.

40. ACTIVITY PAGE

This is the operations center.

Show generations with:

thumbnail/placeholder
model
operation
prompt excerpt
user
project
estimated cost
status
created time
duration elapsed
actions

Filters:

All
Queued
Generating
Completed
Failed
NSFW
Canceled
Submission Uncertain

Status chips should be visually distinctive.

Open a generation detail drawer.

41. GENERATION DETAIL

Display lifecycle information including:

generation ID
provider request ID
model path
prompt
full parameters
inputs
estimated cost
provider status
created
submitted
started
completed
output ingestion status
error details

Also show generation_events as a clean chronological timeline.

Do NOT expose secrets.

Admin debugging should be useful.

42. CANCEL GENERATION

Where supported and request has not reached a terminal state:

show Cancel.

Cancel server-side.

Require confirmation.

Update local status appropriately.

Never fake cancellation before provider response unless clearly marked as requested.

43. FAILED GENERATION

For failed provider generations:

display understandable error.

Provide:

Retry as New Generation

Do not silently resubmit.

The retry creates a new generation record linked to the original.

44. NSFW/MODERATION RESULT

Treat NSFW as a terminal provider result.

Do not display a broken preview.

Show:

Generation blocked by provider moderation.

Store the state and provider metadata safely for diagnostics.

45. MODELS PAGE

Show all configured model registry entries.

Group by family.

Display:

Name
Provider
Media Type
Operation
Status
Description

Members:

read-only.

Admins:

activate/deactivate
edit display metadata
edit recommended-for text
change default parameters
change sort order

Do NOT provide API credential editing through normal database fields.

Credentials remain Supabase secrets.

Provide an architecture where adding a model can largely be done by inserting/configuring a registry record.

46. USAGE PAGE

Build internal usage analytics.

Cards:

Estimated Spend Today
Estimated Spend 7 Days
Estimated Spend 30 Days
Successful Generations
Failed Generations
Active Generations

Charts/tables:

Spend over time
Generations over time
Spend by model
Generation volume by model
Usage by team member
Image vs video generation

Clearly distinguish:

Estimated spend

from:

Actual provider spend

if actual provider cost data isn't available.

Never label an estimate as an exact charge.

Filters:

date range
model
team member
media type

47. SETTINGS PAGE

Admin only where appropriate.

Sections:

Provider

Higgsfield

Enabled/Disabled

Credentials:

Never show secret value.

Only display:

Configured
Not configured

Provider health:

Last successful API interaction
Last API error

Generation Settings

Default image model
Default video model
Require cost estimate
High-cost warning threshold
Max concurrency

Team

List:

name
email
role
active

Allow admin to activate/deactivate team members and change role.

Avoid building a complex invitation system if Supabase admin-level invitation cannot safely be implemented from Lovable without privileged credentials.

Storage

Show:

Total stored assets if easy to calculate
Images
Videos

48. PROVIDER HEALTH

Add a provider health state.

Do not run a paid generation as a health check.

Health should primarily use:

secrets configured status

last successful API request

latest provider error

Where a harmless authenticated endpoint is available, it may be used.

Display in header:

Higgsfield
Connected / Degraded / Not configured

49. CONCURRENCY

Use app setting:

max_provider_concurrency = 15

Before submitting to Higgsfield, count active provider generations.

Active:

submitting
queued
in_progress

If below limit:

submit immediately.

If at limit:

create local state:

local_queued

Implement a server-side dispatcher/reconcile mechanism which submits local queued jobs when slots become available.

Do not make the user repeatedly press Generate.

Respect FIFO ordering for local queue.

Allow admins to change the concurrency number later.

50. REALTIME

Use Supabase Realtime to update:

generation status
Activity
recent outputs
asset ingestion
active job counter

The interface should reflect state changes without manual refreshing.

If Realtime temporarily fails, periodic frontend refetch can act as a lightweight fallback.

51. MARKETING STUDIO PRESETS

Because Marketing Studio presets can change:

DO NOT hardcode preset IDs.

Create a server function that fetches them using Higgsfield credentials.

Cache the result briefly if useful.

Expose only:

id
name
type
safe display metadata

to the frontend.

Support provider pagination/cursor.

52. INPUT VALIDATION

Use strong validation both frontend and server-side.

Frontend validation improves UX.

Server validation is authoritative.

Validate:

required prompts
prompt lengths where known
duration
resolution
aspect ratio
reference count
reference type
file type
numeric ranges
required image/video source
Marketing Studio preset requirements

Never trust browser parameters blindly.

53. ERROR HANDLING

Create a normalized internal error shape.

Examples:

PROVIDER_NOT_CONFIGURED
INSUFFICIENT_PROVIDER_BALANCE
INVALID_PARAMETERS
UPLOAD_FAILED
ESTIMATE_FAILED
PROVIDER_REJECTED
SUBMISSION_UNCERTAIN
PROVIDER_TIMEOUT
MODERATION_BLOCKED
INGEST_FAILED
STORAGE_FAILED
RATE_LIMITED

Show human-readable messages.

Keep technical payload in generation events/provider response for admins.

Do not dump raw JSON errors into normal user UI.

54. PROVIDER BALANCE / INSUFFICIENT FUNDS

If Higgsfield returns insufficient balance:

do not repeatedly retry.

Mark generation appropriately.

Display:

"Higgsfield API balance is insufficient. Top up the provider account before retrying."

Keep any provider dashboard link configurable rather than hardcoding it all over the frontend.

55. DOWNLOADS

Download should come from our Supabase stored copy once ingestion completes.

If generation completed but ingestion is still processing:

show:

"Saving to library…"

Do not present external provider URLs as the permanent download architecture.

56. SECURITY

Non-negotiable:

No provider secret in frontend.

No service-role key in frontend.

Use RLS.

Validate user authentication inside Edge Functions where functions are user-invoked.

Webhook endpoint is provider-facing and must be isolated from normal authenticated endpoints.

Do not allow arbitrary URL fetching that could introduce SSRF vulnerabilities.

Only ingest expected provider result URLs or securely validated URLs from provider responses.

Validate MIME and size before storage where possible.

Sanitize filenames.

Never render untrusted HTML from prompts/provider responses.

57. PERFORMANCE

Do not reload entire pages unnecessarily.

Use:

query caching
optimistic UI where safe
lazy loaded asset previews
pagination/infinite scrolling for large asset libraries
thumbnail-sized previews where possible

Avoid loading full video files on every grid card.

Use:

preload="metadata"

or similarly sensible behavior.

58. ACCESSIBILITY

Use proper labels.

Keyboard navigability.

Reasonable focus states.

Tooltips for unfamiliar controls.

Do not sacrifice usability for style.

59. EMPTY STATES

Build intentional empty states.

Examples:

No Projects:
"Create a project to keep campaign generations together."

No Assets:
"Your generated images and videos will appear here."

No Activity:
"No generations yet."

No API Credentials:
"Higgsfield API isn't configured yet."

Include correct next-step buttons.

60. LOADING STATES

Use skeleton states rather than layout jumps.

Generation status should communicate:

Preparing
Estimating
Submitting
Queued
Generating
Saving
Complete

Do not fake percentage completion unless the provider supplies a genuine progress value.

61. SMART ROUTING — PREPARE BUT DO NOT OVERBUILD

Architect for a later feature:

Generation Priority:

Best Quality
Balanced
Fast
Lowest Cost
Manual Model

Do not implement automatic AI routing unless we have reliable routing criteria.

For V1, implement Manual Model selection as the actual functional mode.

You may prepare the data structures/components so routing can be added later.

62. COMPARE MODE — PREPARE ARCHITECTURE

Future:

one prompt
→ several models
→ side-by-side results

Do not delay V1 for full Compare Mode.

But ensure generations can share:

parent/batch/group identifier

Add optional:

generation_group_id

to generations if useful.

This will support comparison workflows later.

63. DO NOT BUILD THESE YET

Do NOT spend V1 effort implementing:

public community
social profiles
contests
Canvas/node workflow editor
Supercomputer clone
customer billing
public model marketplace
complex Cinema Studio
standalone audio generation
AI prompt chat assistant
mobile native app

The architecture can support expansion later.

64. REQUIRED SUPABASE EDGE FUNCTIONS

Create or appropriately consolidate functions for:

higgsfield-estimate

higgsfield-submit

higgsfield-webhook

higgsfield-status

higgsfield-cancel

higgsfield-prepare-media

higgsfield-ingest-outputs

higgsfield-reconcile

higgsfield-dispatch-queue

higgsfield-marketing-presets

Avoid needless duplication where one clean provider service can be shared.

Server functions should use a common Higgsfield provider utility.

65. SHARED PROVIDER UTILITIES

Create common reusable server utilities for:

credentials
auth header
API base URL
request handling
safe JSON parsing
error normalization
media upload
status normalization
result normalization

Do not duplicate provider fetch logic in every Edge Function.

66. REQUEST LOGGING

Do not log API secrets.

Safe logs may include:

generation UUID
provider request ID
model path
status
HTTP status
error category
duration

Redact:

Authorization
secret
raw credentials

67. DATA RETENTION

Generated outputs must be retained indefinitely in our own storage unless manually deleted.

Do not depend on provider retention.

Soft-delete assets first where appropriate.

Actual storage deletion can be performed deliberately.

68. DELETION

Asset delete:

confirmation modal.

Prefer soft delete:

deleted_at

Hide soft deleted assets from normal views.

Do not delete generation audit history when deleting an asset.

69. USE-AS-REFERENCE

From any asset:

Use as Reference

opens Create and preloads it.

Image assets should be eligible for image/video workflows depending on model.

Video assets can be references for supported video models.

Preserve project association.

70. PROJECT CONTINUITY

If generating inside a selected project:

generation gets project_id

reference uploads get project context

resulting assets automatically join project

Do not require moving assets afterward.

71. GLOBAL SEARCH

If practical, include a lightweight global search for:

Projects
Assets

Search prompts/titles/project names.

Do not let this delay core functionality.

72. RESPONSIVE BEHAVIOR

Desktop is priority.

Tablet should remain highly usable.

Mobile can use:

collapsible sidebar
stacked creation controls
bottom sheets/drawers where useful

Do not simply shrink desktop controls until unusable.

73. NO MOCK DATA IN FINAL APPLICATION

During development, seed model configuration.

Do not leave fake generations/assets/users pretending to be production information.

Empty states should appear correctly when database is empty.

74. API CREDENTIAL CONFIGURATION EXPERIENCE

If Higgsfield secrets are missing:

application still loads.

Create page displays a non-intrusive admin warning:

"Configure Higgsfield credentials before generating."

Generate disabled.

Admin Settings displays exact required secret names:

HF_KEY_ID
HF_KEY_SECRET

Never ask for API secrets through an ordinary browser input that stores them in database records.

They must be configured as backend secrets.

75. FIRST-RUN EXPERIENCE

After authentication:

If provider not configured:

show setup banner.

If configured:

open Create immediately.

Do not force an unnecessary onboarding wizard.

76. ACCEPTANCE CRITERIA

Do not consider this build complete until the following flow exists:

Internal user logs in.

User creates or selects a project.

User opens Create.

User selects Image.

User selects Soul 2 or Ideogram.

Dynamic controls appear.

User enters prompt.

Cost estimate is obtained.

User clicks Generate.

Generation appears immediately in Activity.

Higgsfield request executes server-side.

Request ID is stored.

UI remains usable.

Provider webhook/status eventually changes job to completed/failed.

Completed output is copied to Supabase Storage.

Asset appears in Recent Outputs and Assets.

User can download it.

User can use it as a new reference.

User can click Animate.

Create switches to Video with image preloaded.

User selects Seedance/Kling.

Valid video parameters appear.

Cost is estimated.

Video generation is submitted.

Activity tracks it asynchronously.

Completed video is stored permanently.

Usage records estimated spend.

Project contains image and video.

Recreate works.

Failed jobs produce clear errors.

Duplicate submission protections work.

Provider secrets never appear in browser code.

That is the minimum definition of V1 complete.

77. IMPLEMENTATION PRIORITY

When tradeoffs are necessary, prioritize in this order:

security

functional API generation

async reliability

permanent media storage

dynamic model architecture

Create experience

asset management

project management

activity/debugging

usage analytics

visual polish

Do not sacrifice core functionality merely to complete secondary UI features.

78. ENGINEERING QUALITY

Use:

strong TypeScript types
small reusable components
shared hooks/services
proper error boundaries
clear folder structure
no massive monolithic Create component
no duplicated API logic
no TODO placeholders for core functionality
no fake API behavior

Keep frontend provider-agnostic.

Keep provider logic server-side.

79. FINAL SELF-AUDIT

After implementation, inspect the complete build yourself.

Check for:

broken imports
TypeScript errors
missing routes
missing database tables
incorrect RLS
storage permissions
unhandled loading states
duplicate generation risks
API keys leaking client-side
hardcoded prices
hardcoded Marketing Studio preset UUIDs
broken asset preview URLs
missing output ingestion
missing webhook handling
unconnected UI buttons
placeholder actions
dead navigation
mobile overflow
dark mode contrast
console errors

Fix the issues you identify rather than merely listing them.

80. FINAL RESPONSE TO ME

When the implementation is finished, do not give me a generic summary.

Give me:

What was built.

Database migrations created.

Edge Functions created.

Higgsfield models configured.

Secrets I must add.

Any one-time Supabase configuration steps still required.

Any scheduled/cron functions I must enable.

Any limitation you could not technically complete.

Exact steps for my first real test generation.

The goal is to leave me with a functioning internal production application, not a concept or incomplete scaffold.

Execute the entire build now.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://canvas-xeno-studio.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
