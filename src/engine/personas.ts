// Persona fixtures ported verbatim from the Founder HQ v3 prototype (founder_hq_prototype.html).
// Illustrative sample data only.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Persona = {
  id: string; name: string; initial: string; color: string; role: string;
  path: 'funded' | 'bootstrap' | 'enterprise'; pathLabel: string; goal: number;
  blurb: string[]; idea: string; pitch: string; customer: string; problem: string;
  runway: number; runwayLabel: string; unit: string; revLabel: string;
  estimate: number; hireCost: number; betaN: number;
  clarify: [string, string[]][]; research: string[]; market: string[]; personas: string[]; competitors: string[];
  contacts: { who: string; q: string; sig: 'strong' | 'weak' | 'none' }[];
  pricing: { label: string; val: number; fit: number; note: string }[];
  features: { n: string; core: number }[];
  arch: string[]; stories: string[];
  fund: any; company: { t: string; d: string }[]; stampWord: string;
  hires: { n: string; r: string; fit: number; note: string }[];
  channels: { n: string; v: number }[];
  scale: string; scaleNote: string;
};
export const PERSONAS: Record<string, Persona> = {
  veejay:{ id:'veejay', name:'Veejay', initial:'V', color:'--p-veejay', role:'Project manager, Bengaluru', path:'funded', pathLabel:'Venture-funded', goal:0,
    blurb:['First-time founder leaving a job','Wants investors, but when?','Watch out: building too much, too early'],
    idea:'ClinicFlow', pitch:'Appointment reminders for dental clinics', customer:'Dental clinic owners and receptionists',
    problem:'About 1 in 4 dental patients miss their appointment. Each empty chair costs the clinic money and staff time.',
    runway:12, runwayLabel:'Runway', unit:'clinics', revLabel:'Monthly revenue', estimate:18, hireCost:1.1, betaN:12,
    clarify:[['Who feels the no-show pain most?',['Receptionists','Clinic owners','Patients']],['How do clinics handle it today?',['Phone calls the night before','SMS from their software','Nothing at all']],['What would make a clinic switch?',['Fewer empty chairs','Less staff time','Looking modern']]],
    research:['<b>Web search:</b> clinic surveys put no-shows at 15–25% of booked slots','<b>MiroFish simulation:</b> 200 simulated patients; WhatsApp reminders beat SMS about 3 to 1','<b>Notebook:</b> 14 sources saved, including 2 dental association reports'],
    market:['<b>Market:</b> about 9,000 private dental clinics in Karnataka','<b>Start with:</b> 1,200 clinics in Bengaluru','<b>First-city revenue at full adoption:</b> about ₹72 lakh a year'],
    personas:['<b>Sunil, receptionist:</b> spends 2 hours a night on reminder calls','<b>Dr. Kavya, owner:</b> loses 3 chairs a day; wants proof before paying'],
    competitors:['<b>Clinic software:</b> has SMS reminders that nobody switches on','<b>Generic WhatsApp tools:</b> no calendar sync','<b>Gap:</b> reminders that rebook automatically'],
    contacts:[
      {who:'Dr. Kavya · clinic owner', q:'Three no-shows a day. I just absorb the cost.', sig:'strong'},
      {who:'Sunil · receptionist', q:'I call every patient the night before. It takes two hours.', sig:'strong'},
      {who:'Dr. Imran · owns 3 clinics', q:'Nobody reads SMS any more. WhatsApp, maybe.', sig:'strong'},
      {who:'Priya · patient', q:'I just forget. A message that morning would help.', sig:'weak'},
      {who:'Your cousin · clinic owner', q:'Of course I would use it! Anything for you.', sig:'none'},
      {who:'Dr. Rao · solo practice', q:'Our software can send reminders. We never switched it on.', sig:'weak'}],
    pricing:[{label:'₹500 per clinic per month', val:500, fit:2, note:'Less than one missed appointment. 9 of 12 clinics said yes.'},{label:'₹2,000 per clinic per month', val:2000, fit:1, note:'Only owners of several clinics said yes.'},{label:'Free, paid for by ads', val:80, fit:0, note:'Clinics refused ads inside patient messages.'}],
    features:[{n:'WhatsApp reminders',core:1},{n:'One-tap rebooking',core:1},{n:'Calendar sync',core:1},{n:'No-show report',core:1},{n:'Billing',core:0},{n:'Patient records',core:0},{n:'Loyalty points',core:0},{n:'Multi-branch admin',core:0}],
    arch:['WhatsApp Business API, SMS as fallback','Calendar sync with the 3 most used clinic tools','Phone numbers encrypted; consent captured at booking'],
    stories:['As a receptionist, I want reminders sent automatically, so I stop making 40 calls a night.','As a patient, I want to rebook with one tap, so I keep my slot.'],
    fund:{asks:[{l:'₹25 lakh',r:8},{l:'₹50 lakh',r:14},{l:'₹1 crore',r:24}], who:'angel investors', voters:['A1','A2','A3']},
    company:[{t:'Private limited registration',d:'Filed with the Registrar of Companies'},{t:"Founders' agreement",d:'Equity split, vesting, roles'},{t:'IP assignment',d:'Code and brand belong to the company'}], stampWord:'SIGNED',
    hires:[{n:'Arun',r:'Full-stack developer',fit:1,note:'Built a booking app before'},{n:'Divya',r:'Mobile developer',fit:1,note:'Knows the WhatsApp API'},{n:'Karthik',r:'Sales lead',fit:0,note:'Strong, but nothing to sell yet'},{n:'Leela',r:'Product designer',fit:1,note:'Worked on clinic software'}],
    channels:[{n:'Dental association WhatsApp groups',v:3},{n:'Clinic visits with a live demo',v:3},{n:'Google search ads',v:1},{n:'Launch party and press',v:1}],
    scale:'Raise a seed round', scaleNote:'Expand to Chennai and Hyderabad.' },
  meera:{ id:'meera', name:'Meera', initial:'M', color:'--p-meera', role:'Freelance developer, Pune', path:'bootstrap', pathLabel:'Bootstrapped', goal:1,
    blurb:['Solo founder who keeps freelancing','No investors: grows from revenue','Watch out: running out of savings'],
    idea:'TutorBooks', pitch:'Fee tracking and reminders for home tutors', customer:'Home tutors with 10–40 students',
    problem:'Home tutors chase parents for fees over WhatsApp and lose track of who has paid. Many lose a month of fees a year.',
    runway:8, runwayLabel:'Savings', unit:'tutors', revLabel:'Monthly revenue', estimate:4, hireCost:.4, betaN:20,
    clarify:[['Who feels the fee-chasing pain most?',['Tutors','Parents','Coaching centres']],['How do tutors track fees today?',['A notebook','WhatsApp messages','A spreadsheet']],['What would make a tutor switch?',['Getting paid on time','Less awkward reminders','Looking professional']]],
    research:['<b>Web search:</b> tutor forums say 1 in 6 parents pay late every month','<b>MiroFish simulation:</b> 150 simulated parents; a payment link halved late payments','<b>Notebook:</b> 9 sources saved, mostly tutor forum threads'],
    market:['<b>Market:</b> over 1 lakh home tutors in Pune','<b>Start with:</b> maths and science tutors','<b>Year-one target:</b> 2,000 tutors ≈ ₹48 lakh a year'],
    personas:['<b>Anita, maths tutor:</b> 30 students, 30 reminder messages a month','<b>Parent of two:</b> would pay on time if they just got a link'],
    competitors:['<b>Coaching software:</b> built for centres, too heavy','<b>Payment apps:</b> no record of who owes what','<b>Gap:</b> a simple fee tracker for one tutor'],
    contacts:[
      {who:'Anita · maths tutor', q:'Every month I send 30 reminders. Some parents ignore them.', sig:'strong'},
      {who:'Joseph · science tutor', q:'I lost ₹18,000 last year to "I already paid".', sig:'strong'},
      {who:'Sana · music teacher', q:'Payments are fine. Scheduling is my problem.', sig:'weak'},
      {who:'Parent of two students', q:'I would pay faster if I just got a link.', sig:'strong'},
      {who:'Your friend · a tutor', q:'Sounds amazing, I would definitely use it!', sig:'none'},
      {who:'Coaching centre owner', q:'We already use full software. Not for us.', sig:'weak'}],
    pricing:[{label:'₹199 per tutor per month', val:199, fit:2, note:'Less than one late fee recovered. Most tutors said yes.'},{label:'₹999 per tutor per month', val:999, fit:1, note:'Only tutors with 40+ students said yes.'},{label:'Free, take 2% of each fee', val:60, fit:0, note:'Tutors hated losing a cut of every fee.'}],
    features:[{n:'Fee tracker',core:1},{n:'UPI reminders',core:1},{n:'Paid / unpaid view',core:1},{n:'Parent payment page',core:1},{n:'Class scheduling',core:0},{n:'Homework uploads',core:0},{n:'Video classes',core:0},{n:'Tutor marketplace',core:0}],
    arch:['Mobile-friendly web app on one small server','UPI payment links through a payment gateway','Stores only names, phone numbers and fees'],
    stories:['As a tutor, I want a reminder with a UPI link sent on the 1st, so I stop chasing parents.','As a parent, I want to see what I owe and pay in one tap.'],
    fund:{leads:['Anita','Joseph','Rekha','Farhan','Gauri','Vikram']},
    company:[{t:'Udyam registration',d:'Register as a small business'},{t:'GST registration',d:'Needed as revenue grows'},{t:'Business bank account',d:'Keep business money separate'}], stampWord:'DONE',
    hires:[{n:'Rohan',r:'Contract designer',fit:1,note:'Screens in 2 weeks'},{n:'Ishita',r:'Part-time support',fit:1,note:'Answers tutors on WhatsApp'},{n:'DevWorks',r:'Outsourced agency',fit:0,note:'Would eat months of savings'},{n:'Kabir',r:'Part-time tester',fit:1,note:'Tests on low-cost phones'}],
    channels:[{n:'Tutor Facebook and WhatsApp groups',v:3},{n:'Referral: free month per invite',v:3},{n:'YouTube how-to video',v:2},{n:'Instagram ads',v:1}],
    scale:'Grow from revenue', scaleNote:'Hire one full-time developer from revenue and open Mumbai.' },
  rahul:{ id:'rahul', name:'Rahul', initial:'R', color:'--p-rahul', role:'Innovation lead, logistics company, Chennai', path:'enterprise', pathLabel:'Enterprise innovation', goal:2,
    blurb:['Builds a new product inside a large company','Needs budget approval, not investors','Watch out: the boss saying yes is not evidence'],
    idea:'DockSlot', pitch:'Truck dock scheduling for warehouses', customer:'Dock supervisors and transport partners',
    problem:'Trucks wait up to 3 hours at warehouse docks because slots are booked by phone and paper. Drivers lose a trip a day.',
    runway:6, runwayLabel:'Budget', unit:'partners', revLabel:'Savings per month', estimate:38, hireCost:1.5, betaN:6,
    clarify:[['Who feels the waiting pain most?',['Transport partners','Dock supervisors','Drivers']],['How are slots booked today?',['Phone calls','A paper register','Email']],['What would make partners switch?',['More trips per day','Shorter waits','Fewer calls']]],
    research:['<b>Web search:</b> industry studies put dock waits at 2–4 hours in Indian warehouses','<b>MiroFish simulation:</b> 300 simulated trucks; slot booking cut average wait to about 40 minutes','<b>Notebook:</b> 11 sources, including 6 months of gate logs'],
    market:['<b>Scope:</b> 14 company warehouses, about 2,100 trucks a day','<b>Start with:</b> the 2 busiest sites','<b>Value:</b> about ₹1.4 crore a year if waits fall by 2 hours'],
    personas:['<b>Murugan, dock supervisor:</b> 200 calls a day','<b>Transport owner:</b> would send more trucks if slots were reliable'],
    competitors:['<b>SAP yard module:</b> costly licence, long rollout','<b>Spreadsheets:</b> no live view','<b>Gap:</b> a light booking layer on top of SAP'],
    contacts:[
      {who:'Murugan · dock supervisor', q:'My phone rings 200 times a day. Half are drivers asking "when?"', sig:'strong'},
      {who:'Selvi · truck driver', q:'I wait 3 hours, then miss my second trip.', sig:'strong'},
      {who:'Transport company owner', q:'If I could book online, I would send more trucks.', sig:'strong'},
      {who:'Warehouse manager', q:'Some days are bad. Mostly it works.', sig:'weak'},
      {who:'Your VP · your boss', q:'Great idea, go for it!', sig:'none'},
      {who:'IT head', q:'We already have SAP. Do not build another big system.', sig:'weak'}],
    pricing:[{label:'Savings case: shorter waits, more trips', val:4000, fit:2, note:'Finance agreed: about ₹1.4 crore a year saved.'},{label:'Charge partners per booking', val:1500, fit:1, note:'Partners would pay, but it slows adoption.'},{label:'Sell it to other companies first', val:500, fit:0, note:'Leadership said: prove it inside first.'}],
    features:[{n:'Slot booking link',core:1},{n:'Live dock board',core:1},{n:'SAP order lookup',core:1},{n:'SMS reminders',core:1},{n:'Driver app',core:0},{n:'Partner billing',core:0},{n:'Yard cameras',core:0},{n:'AI demand forecast',core:0}],
    arch:['Web app on the company cloud with single sign-on','Reads purchase orders from SAP; does not replace it','Driver phone numbers deleted after 90 days'],
    stories:['As a transport partner, I want to book a dock slot from a link, so my driver does not wait.','As a dock supervisor, I want a live board of today\'s slots, so I can plan labour.'],
    fund:{asks:[{l:'₹15 lakh pilot',r:6},{l:'₹40 lakh pilot + rollout',r:12},{l:'₹1 crore full build',r:20}], who:'the steering committee', voters:['CFO','VP','CIO']},
    company:[{t:'Project charter',d:'Scope, owner, budget, success measure'},{t:'Data privacy review',d:'Driver phone numbers and retention'},{t:'IT security sign-off',d:'Single sign-on and access roles'}], stampWord:'APPROVED',
    hires:[{n:'Lakshmi',r:'Full-stack developer',fit:1,note:'Has built SAP integrations'},{n:'Joel',r:'Business analyst',fit:1,note:'Ran the last warehouse rollout'},{n:'Vendor team',r:'External agency',fit:0,note:'6-week contract delay'},{n:'Priyanka',r:'QA engineer',fit:1,note:'Knows the test environments'}],
    channels:[{n:'Train supervisors on site',v:3},{n:'Onboarding calls with partners',v:3},{n:'Company-wide email',v:1},{n:'Posters at the gate',v:1}],
    scale:'Roll out to all 14 warehouses', scaleNote:'Take pilot results to the steering committee.' },
};
export const GOALS: string[] = ['Build a venture-scale startup','Build a profitable small business','Launch a new product inside my company','A side project to learn'];
