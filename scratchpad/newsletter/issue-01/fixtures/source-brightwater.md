Brightwater Facilities Group — notes for the case study thing (draft, not final)

Background / company info
Brightwater Facilities Group is a mid-market facilities management provider. They look after roughly 240 commercial sites across three regions — offices, light industrial, a few retail parks. Around 600 field engineers, most of them subcontracted. The company has been around since the late 90s and grew mostly by acquiring smaller regional operators, which is part of why the systems situation is what it is. Four separate scheduling systems inherited from acquisitions, plus a lot of spreadsheets. Also worth mentioning they won a regional service award two years ago, not sure if that's relevant here.

The problem, as the ops director described it in the kickoff call: reactive maintenance jobs were being logged in one system, planned maintenance in another, and the subcontractor network was coordinated over email and phone. Nobody could answer the question "what is happening at site X this week" without three people checking three systems. Engineers regularly turned up to sites where the work had already been done by someone else. Site managers complained about this a lot. There was no single view.

We deployed the FieldSync scheduling platform. Phase 1 was the planned maintenance migration — took about 11 weeks, longer than the 8 we'd scoped, mostly because the asset data from the two acquired operators was in worse shape than anyone expected (duplicate asset IDs, missing site references, one region had assets recorded against the wrong postcodes entirely). Phase 2 brought reactive jobs onto the same platform. Phase 3, subcontractor onboarding, is still running.

Solution detail
FieldSync gives them one scheduling view across planned and reactive work. Jobs are dispatched to engineers on mobile, engineers close jobs on site with photo evidence, and the site manager portal shows what is scheduled and what was completed. We also built a custom integration to their finance system so completed jobs flow into invoicing without rekeying — that was not in the original scope but became necessary in month four.

Again on the problem side: the four scheduling systems meant duplicate work was common, and the reactive/planned split was the core issue. Engineers turning up to already-completed jobs was the most visible symptom.

What they wanted out of it
- One view of all work across all sites
- Stop duplicate dispatch
- Get subcontractors onto the same system as employed engineers
- Something the finance team could actually reconcile against
- Reduce the amount of phone coordination

Where things stand
Phase 1 and 2 are live across all three regions. Phase 3 is partially live — about 40% of the subcontractor network is onboarded, the rest are scheduled for next quarter. The ops director said in the last steering meeting that duplicate dispatch "has basically stopped" but we don't have a number for that yet. Site managers seem happier. The finance integration is working, though nobody has measured the time saved on invoicing.

We haven't done a formal benefits review. That's booked for the end of the quarter. So there are no hard numbers to quote yet, and the customer has asked us not to publish anything that implies measured savings until that review is done.

Other notes
Contract is 3 years with a 2 year extension option. The account team think this is a good reference site once Phase 3 completes. Legal have not reviewed any quotes yet and we do not have a named customer quote — the ops director said he would provide one "at some point".
