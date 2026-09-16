/**
 * scripts/seed-docs-content-omen.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Content definitions for the three fictional Omen United Insurance sample
 * documents used by the Phase 5 demo seed.
 *
 * ALL NAMES, POLICY NUMBERS, FIGURES, ADDRESSES AND TERMS ARE FICTIONAL and
 * exist purely to produce coherent retrieval and answers in the Clara demo
 * environment. Nothing in these documents is real insurance advice.
 *
 * Structure shared by every document:
 *   title        — shown on the title page
 *   filename     — output file name
 *   meta         — subtitle / version / fictional doc reference
 *   sections[]   — { heading, blocks[] } where a block is one of:
 *                    { p: string }                       paragraph
 *                    { bullets: string[] }               bullet list
 *                    { table: { cols: string[], rows: string[][] } }
 *                    { qa: { q: string, a: string } }    FAQ pair (rendered bold)
 */

export const OMEN_DOCS = [
  {
    title: "Home Insurance Policy 2024",
    filename: "Home-Insurance-Policy-2024.pdf",
    meta: {
      subtitle: "Omen Shield Home Policy — Buildings, Contents and Personal Possessions",
      version: "Policy Wording version 2024.3 (Sample)",
      reference: "Sample document HOM-2024-SAMPLE-001",
      pages: 25,
    },
    sections: [
      {
        heading: "1. Important Notice and About This Policy",
        blocks: [
          { p: "This is a SAMPLE document created for demonstration and training purposes only. Omen United Insurance is a fictional insurer and every policy number, figure, limit and address in this wording is invented. This document must not be used as real insurance advice, and no real coverage is provided by it. It is included in the Omen demo knowledge base so that assistants can answer questions about how a typical home insurance policy is structured." },
          { p: "This policy wording sets out the terms under which Omen United Insurance (referred to in this document as \u201cwe\u201d, \u201cus\u201d or \u201cOmen\u201d) will pay for loss of or damage to your home and its contents. The wording is divided into sections: Section A covers the buildings, Section B covers home contents, and Section C covers personal possessions taken outside the home. Optional extensions, such as accidental damage and home emergency, are described in the Optional Extras section of this wording." },
          { p: "Your policy schedule shows the sections you have purchased, the sums insured, the excess amounts that apply to each section, and any endorsements specific to your address. Where the schedule and this wording differ, the schedule takes priority. Please read both documents together and keep them in a safe place, because the claims procedure in Section 18 refers to information that appears only on the schedule." },
        ],
      },
      {
        heading: "2. Summary of Cover",
        blocks: [
          { p: "The table below summarises the standard limits under the Omen Shield Home Policy. Each limit is the maximum we will pay for any one claim under that heading, unless your schedule states a higher or lower figure. The excess shown in the final column is the amount you must pay towards each claim; a more detailed excess table appears in Section 16." },
          {
            table: {
              cols: ["Cover section", "Standard limit (sample)", "Excess"],
              rows: [
                ["Buildings (Section A)", "\u00a3400,000 rebuild cost", "\u00a3250 standard"],
                ["Home contents (Section B)", "\u00a350,000 total sum insured", "\u00a3250 standard"],
                ["Single article limit (contents)", "\u00a32,500 per item", "\u00a3250"],
                ["Personal possessions (Section C)", "\u00a37,500 total", "\u00a3250"],
                ["Bicycles (unspecified)", "\u00a3500 aggregate", "\u00a3250"],
                ["Garden equipment", "\u00a32,500 aggregate", "\u00a3250"],
                ["Home office equipment", "\u00a35,000 aggregate", "\u00a3250"],
                ["Flood (buildings and contents)", "Section limit", "\u00a3500"],
                ["Subsidence and ground movement", "\u00a3Section limit", "\u00a31,000"],
                ["Escape of water", "Section limit", "\u00a3350"],
              ],
            },
          },
          { p: "Cover is provided on a new-for-old (replacement as new) basis for contents, which means we replace a damaged or destroyed item with a new equivalent item of the same kind and quality, without deduction for wear and tear. Clothing and linen are covered on a new-for-old basis only if they are less than five years old at the date of loss. Buildings cover operates on a reinstatement basis, meaning the sum insured must reflect the full cost of rebuilding the property, including professional fees and debris removal." },
        ],
      },
      {
        heading: "3. Section A — Buildings Cover",
        blocks: [
          { p: "Section A covers the domestic buildings at the address shown on your policy schedule, including the structure of the house or flat, garages, outbuildings, greenhouses, walls, gates, fences, hedges, terraces, patios, drives, swimming pools and tennis courts, all within the boundaries of the insured address. Fixtures and fittings that would normally be left behind if you moved, such as fitted kitchens, fitted wardrobes, bathroom suites and central heating installations, are treated as part of the buildings." },
          { p: "The buildings sum insured must equal the full rebuilding cost of the property, not its market value. Rebuilding cost includes the cost of demolition, site clearance, architects' and surveyors' fees, and compliance with current building regulations. If the sum insured is less than the full rebuilding cost, we will apply the average provision described in Section 20, which reduces the amount we pay in proportion to the degree of under-insurance." },
          { p: "Buildings cover responds to insured events including fire, smoke, lightning, explosion, storm, flood, escape of water from fixed installations, theft or attempted theft resulting in damage to the building, subsidence, landslip or heave of the site, and impact by vehicles, falling trees or aircraft. Each of these events is subject to the excesses set out in Section 16 and to the general exclusions in Section 15." },
          { p: "Loft conversions, extensions and structural alterations are covered only if you have notified us of the work before it begins and the rebuilding cost has been adjusted accordingly. Temporary alternative accommodation, up to 20 per cent of the buildings sum insured, is payable under Section A if the home becomes uninhabitable after an insured event, for as long as reinstatement reasonably takes, to a maximum of 24 months." },
        ],
      },
      {
        heading: "4. Section B — Home Contents Cover",
        blocks: [
          { p: "Section B covers household goods, furnishings, furniture, domestic appliances, audio-visual and computer equipment, clothing, linen, sports equipment, garden furniture and equipment kept at the insured address, and food and drink in freezers or refrigerators. Contents are covered while they are within the home, in outbuildings and garages at the same address, and in the open areas of the insured grounds." },
          { p: "The contents sum insured must represent the full replacement cost of all contents as new. Single articles, pairs, sets or collections worth more than the single article limit of \u00a32,500 must be specified individually on the schedule; unspecified items are limited to \u00a32,500 each in any one claim. Valuables — defined as jewellery, watches, furs, items of gold, silver or other precious metals, pictures and other works of art, stamps and coin collections — have an overall limit of one third of the contents sum insured within any one claim, unless otherwise agreed." },
          { p: "Contents in the open air within the insured boundary are covered against theft only if there is evidence of violent and forcible entry to a locked building or an attended area. Money and gift cards are covered up to \u00a3500 in total; credit cards are covered only for their fraudulent use occurring within 48 hours before you first notify the issuing institution. Pedal cycles are covered at the insured address under Section B, and away from the address only if specified under Section C." },
        ],
      },
      {
        heading: "5. Section C — Personal Possessions Away From Home",
        blocks: [
          { p: "Section C, which must be purchased as an addition to Section B, covers personal possessions, clothing, sports equipment, musical instruments and other portable items that belong to you or to family members permanently residing with you, anywhere in the United Kingdom, and for up to 60 days in any one period of insurance elsewhere in the world. Cover under this section operates on an all-risks basis, which means that possessions are insured against any accidental loss or damage, subject only to the exclusions stated in this wording." },
          { p: "The maximum any one article limit under Section C is \u00a32,500 unless the article is specified. Bicycles must be individually specified to be covered away from the home, and specified bicycles are covered against theft only when secured by an approved lock to an immovable object. Photographic equipment, laptops and portable electronic equipment are subject to a combined limit of \u00a35,000 in any one claim unless specified on the schedule." },
          { p: "Personal money is covered under Section C up to \u00a3500. Business samples and trade equipment owned by you are covered up to \u00a32,500 in total. Weddings, civil partnership celebrations and religious festivals receive an automatic 10 per cent increase in the contents sum insured for a period of seven days immediately before and after the event, reflecting the additional gifts, clothing and equipment typically present at the home during such occasions." },
        ],
      },
      {
        heading: "6. Flood and Water Damage",
        blocks: [
          { p: "Flood cover is included as standard under both Section A and Section B of the Omen Shield Home Policy. Flood means covering by water from rivers, canals, lakes, the sea or other natural watercourses, and also surface water caused by rainfall or melting snow that has not entered through the drainage system. A flood claim carries a specific excess of \u00a3500, which replaces the standard \u00a3250 excess, as shown in the excess table in Section 16." },
          { p: "It is important to distinguish flood from escape of water. Escape of water means water leaking from fixed domestic installations such as burst pipes, overflowing baths, failed washing machine hoses or leaking central heating systems. Escape of water claims carry an excess of \u00a3350. Both flood and escape of water cover the resulting damage to buildings and contents, but neither covers the cost of repairing the source of the leak itself — for example, replacing the section of pipe that burst — unless the pipe was damaged by an insured event such as a fire." },
          { p: "Gradual deterioration is excluded throughout the policy. Damage that occurs slowly over weeks or months, persistent drips that you were aware of and did not repair, wet rot, dry rot, and condensation are not insured, because home insurance responds to sudden and unforeseen events rather than maintenance issues. If a slow leak is discovered, we will pay for the damage caused by the sudden failure, but not for damage that accumulated over time where a reasonable homeowner would have taken action." },
          { p: "After a flood, you must take all reasonable steps to remove water and dry the property. Our emergency network will arrange dehumidification and, where buildings cover applies, we will pay for the cost of pumping out water, drying out, and sanitising the property as part of the claim. Alternative accommodation is available under Section A while the home is uninhabitable. Further guidance appears in the claims procedure in Section 18." },
        ],
      },
      {
        heading: "7. Fire, Smoke and Explosion",
        blocks: [
          { p: "Fire and smoke damage is covered under Sections A and B, including scorching where a fire has actually occurred, and damage caused by soot and smoke from a fire within the home or from a neighbouring property. Damage caused by heat without ignition — for example, a warped worktop caused by a hot pan — is not fire damage, but may be covered under the accidental damage extension described in Section 11 if purchased." },
          { p: "Explosion, whether within or outside the home, is insured, including the effects of sonic bangs from aircraft travelling at or beyond the speed of sound. Lightning strike is insured as a standard peril; typically it damages electrical equipment and induces power surges, which are covered under buildings and contents where the lightning caused the surge. Power surges arising from failures in the public electricity supply that are not caused by lightning are covered only under the optional home electrical extension." },
          { p: "Following a fire, the sum insured should allow for the full cost of reinstatement, including smoke odour removal, cleaning of undamaged items, and reinstatement matching — where, for example, a destroyed tiled floor cannot be matched, we will pay to retile the entire connected area so the finish is uniform. Fire brigade charges up to \u00a31,500 are payable under Section A where a fire or rescue service makes a statutory charge." },
        ],
      },
      {
        heading: "8. Storm Damage",
        blocks: [
          { p: "Storm cover applies to damage caused by abnormally severe weather, including high winds, hailstorms, and the weight of snow. There is no separate storm excess; the standard \u00a3250 excess applies. Damage to fences, gates and hedges caused by storm is excluded, because these items are the items most frequently damaged by wind and their exclusion keeps premiums affordable. Damage to garden trees is covered only for the cost of removing the fallen tree from the insured property; the value of the tree itself is not insured." },
          { p: "Storm claims are assessed with reference to meteorological data. Where damage is caused by weather that is normal for the season and the region — for instance, a lost roof tile during ordinary gales on an ageing roof — the claim may be declined as wear and tear rather than storm damage. Roof coverings must be maintained in a sound condition, wind-lifted tiles on a roof that was already in poor repair are excluded under the wear-and-tear provisions in Section 15." },
        ],
      },
      {
        heading: "9. Theft and Burglary",
        blocks: [
          { p: "Theft cover under Sections A and B responds to loss or damage caused by theft, attempted theft, or vandalism that follows a break-in. There must be evidence of violent and forcible entry to or exit from the building for a theft claim to succeed. Marks of forcible entry may be to any part of the building, including doors, windows, roof lights or walls. Where property is stolen from an outbuilding, garage or shed, forcible entry to that structure must also be shown." },
          { p: "Theft from the home by family members, invited guests, tenants or domestic employees is excluded, as is theft of items left in the open within the boundary unless violent and forcible entry to a secured area can be demonstrated. Keys obtained by deception — the so-called fake caller scenario — are covered only where the burglar entered the home by using violence against the fabric of the building, not where they entered using a legitimately obtained key without damage." },
          { p: "A theft excess of \u00a3250 applies to each theft claim. You must report the theft to the police as soon as reasonably possible and obtain an incident reference number; claims are usually declined where no crime reference exists. Following a theft involving keys, locks and any electronically operated access devices must be replaced, and we will pay for replacement locks and keys up to \u00a3750 in total under Sections A and B combined." },
        ],
      },
      {
        heading: "10. Subsidence and Ground Movement",
        blocks: [
          { p: "Subsidence, landslip and heave of the site beneath the home are covered under Section A, subject to a specific excess of \u00a31,000 for each subsidence claim. Subsidence means the downward movement of the ground supporting the property, often associated with clay soils that shrink in dry weather, or with water leaking from drains that washes away finer soil particles. Heave is the opposite — upward movement — and landslip is the sideways movement of the ground down a slope." },
          { p: "The subsidence excess applies per building, per period of insurance, not per claim: where a series of claims arises from the same subsidence event during one period of insurance, only one \u00a31,000 excess is deducted in total. Root damage caused by trees and shrubs is covered, including the cost of removing the responsible tree and underpinning the affected walls, but the value of the tree itself is not covered, and the cost of remedial action taken purely to prevent future subsidence — such as pruning a healthy tree — is not insured." },
          { p: "Coastal erosion, and damage arising from mining, quarrying or demolition activities, is excluded under this policy unless specially endorsed. Properties built on made-up ground or over historical mine workings require disclosure at inception; where such properties are accepted, a specific endorsement stating the applicable terms will appear on your schedule." },
        ],
      },
      {
        heading: "11. Accidental Damage Extension (Optional)",
        blocks: [
          { p: "The accidental damage extension is an optional addition to Sections A and B that broadens cover to include sudden and unforeseen damage caused by a one-off accident. Typical accidental damage claims include a television knocked from its stand, a football smashing a greenhouse pane, a nail driven through a water pipe while hanging a picture, spillage on a carpet or sofa, and a worktop scorched by a hot pan." },
          { p: "The extension does not cover damage happening gradually, damage caused deliberately, damage to property being worked on by tradespeople where the damage arises from the work itself, damage to clothing by pets, or the failure of any component as a result of a manufacturing defect. Computer data loss is covered only as physical damage to the medium that stores the data; the cost of recreating data itself is not covered." },
          { p: "Accidental damage claims attract the standard \u00a3250 excess. Where a single accident damages both buildings and contents — for example, a bath overflowing causes water damage to the floor and to belongings below — a single excess applies to the combined claim rather than one excess per section." },
        ],
      },
      {
        heading: "12. Garden Equipment, Bicycles and Outbuildings",
        blocks: [
          { p: "Garden furniture, lawnmowers, strimmers, barbecues, power tools kept in a shed, ornamental planters, and garden ornaments are covered under Section B up to a combined garden equipment limit of \u00a32,500 in any one claim, provided they are within the boundaries of the insured address. Items stored in the open — such as garden furniture left on a terrace — are covered against theft only when locked away in a building or secured structure overnight." },
          { p: "Bicycles at the insured address are covered under the garden equipment and general contents provisions up to an unspecified aggregate limit of \u00a3500 per claim. Any bicycle worth more than \u00a3500 must be specified individually on the schedule; a specified bicycle attracts its own sum insured and is covered away from the home under Section C against theft only when secured with an approved lock. Competitive cycling events, racing and time trials are excluded for both specified and unspecified bicycles." },
          { p: "Outbuildings — sheds, garages, greenhouses and summer houses — are covered as part of Section A, but tools and equipment owned for business use and stored in outbuildings are limited to \u00a32,500 in total unless a business extension has been purchased. Trampolines, above-ground swimming pools and climbing frames are covered as garden structures under Section A against insured events, but not against collapse caused by gradual weakening of joints or supports." },
        ],
      },
      {
        heading: "13. Home Office and Business Use",
        blocks: [
          { p: "A growing number of households run office space at home, and the Omen Shield policy provides a home office equipment limit of \u00a35,000 in total under Section B for computers, printers, monitors, office furniture and related equipment used for clerical, administrative or study purposes. Where business stock or trade equipment is kept at the address, the standard limit is \u00a32,500 unless the business contents extension has been purchased." },
          { p: "Business use beyond clerical work — including client visits, giving tuition at home, mail order trading and storage of goods for sale — requires notification, and cover will be extended by endorsement to reflect the increased exposure. The home emergency and alternative accommodation provisions are unaffected by home office use, but any liability arising from the business itself is covered only under a separate business policy." },
        ],
      },
      {
        heading: "14. Liability to the Public",
        blocks: [
          { p: "Under both Sections A and B we will pay amounts you become legally liable to pay as compensation for accidental bodily injury to any person, or accidental loss of or damage to their property, occurring in connection with the insured address or your domestic activities. The limit is \u00a32,000,000 for any one occurrence, including legal costs incurred with our written agreement. Cover extends to liability arising as a private householder, tenant or occupier, and to the domestic activities of family members living with you." },
          { p: "Cover also extends to your liability as owner or occupier for incidents away from the home that arise from your domestic life — for example, injury to a third party caused by your child at a park. Liability arising from the ownership or use of motor vehicles, aircraft, watercraft and dogs of restricted breeds is excluded, because separate insurance arrangements are legally required for those exposures." },
        ],
      },
      {
        heading: "15. General Exclusions",
        blocks: [
          { p: "The following exclusions apply to all sections of this policy. They exist either because the loss is better addressed through maintenance, or because insuring the exposure would be commercially unworkable, or because the law restricts what may be insured." },
          {
            bullets: [
              "Wear and tear, gradual deterioration, rot, corrosion, settlement, shrinkage or manufacturing defects.",
              "Deliberate or criminal acts by you, by anyone living with you, or by anyone acting on your behalf.",
              "War, invasion, terrorism, civil commotion, and contamination by radioactivity or nuclear fuel.",
              "Storm damage to fences, gates and hedges.",
              "Damage caused by pets, vermin, insects or wild animals, other than impact damage to the building.",
              "The cost of repairing the source of an escape of water, oil or central heating fluid.",
              "Confiscation or destruction by order of any government or public authority.",
              "Any consequence of a data breach, hacking or computer virus, other than physical damage to the equipment itself.",
              "Loss of, or damage to, property held in trust or on commission for which a specific policy is required.",
            ],
          },
          { p: "Sums that fall below the excess are not payable, and where loss is caused jointly by an insured event and an excluded cause, we will pay only the portion attributable to the insured event, as agreed with the loss adjuster appointed to the claim." },
        ],
      },
      {
        heading: "16. Excesses",
        blocks: [
          { p: "The excess is the first part of each claim that you pay yourself. The standard excess is \u00a3250, and higher excesses apply to specific causes of loss. The applicable excess is always shown on your policy schedule. Choosing a higher voluntary excess reduces the premium at renewal, but does not change the specific excesses listed below, which are fixed policy conditions." },
          {
            table: {
              cols: ["Type of claim", "Excess (sample figures)"],
              rows: [
                ["Standard buildings and contents claim", "\u00a3250"],
                ["Flood (any section)", "\u00a3500"],
                ["Escape of water from fixed installations", "\u00a3350"],
                ["Subsidence, landslip or heave", "\u00a31,000 (per building, per period of insurance)"],
                ["Theft or attempted theft", "\u00a3250"],
                ["Accidental damage extension claim", "\u00a3250"],
                ["Windscreen-type glass in outbuildings", "\u00a3250"],
              ],
            },
          },
          { p: "Only one excess applies to each claim, even where the claim spans two sections — for example, an escape of water damaging both the floor and belongings. Where two specific excesses could apply, the higher one is deducted once. Excesses apply separately to buildings claims and to contents claims that arise from entirely different events." },
        ],
      },
      {
        heading: "17. Conditions and Security Requirements",
        blocks: [
          { p: "You must take reasonable care to keep the home and its contents in good condition and must comply with the security conditions shown on the schedule. Standard security requires five-lever mortice deadlocks or multi-point locking on final exit doors, and key-operated window locks on all accessible ground floor windows. Where your schedule specifies enhanced security, the stated requirements must be satisfied in full, and claims arising through failure to comply may be reduced or declined." },
          { p: "If the home is unoccupied for more than 30 consecutive days, cover for theft, malicious damage, escape of water and glass breakage is suspended until you return, unless we agree otherwise. For unoccupied periods between 31 and 60 days, we may maintain full cover on condition that water is drained down or the system is inspected weekly. Long-term unoccupancy requires a specific endorsement and attracts an additional premium." },
          { p: "You must inform us of any material change of circumstances, including change of use, structural alterations, convictions, and any bankruptcy or insolvency proceedings. Failure to disclose material information may make the policy void from inception. Property insurance operates on the principle of utmost good faith, which requires both parties to disclose all facts that would influence a prudent underwriter." },
        ],
      },
      {
        heading: "18. Claims Procedure",
        blocks: [
          { p: "If you need to make a claim, follow the five steps below. Claims may be notified at any time through the Omen claims portal, by telephone, or by email; the contact details appear on your policy schedule. You should notify us within 48 hours of discovering the loss, and in any event as soon as reasonably possible." },
          {
            bullets: [
              "Step 1 — Make the situation safe and take reasonable steps to prevent further damage; do not dispose of damaged items before they have been inspected or photographed.",
              "Step 2 — Notify us within 48 hours, describing the event, the date, and the items or damage involved; for theft, also report the matter to the police and obtain an incident reference number.",
              "Step 3 — Provide evidence within 30 days: photographs, receipts, bank statements, valuations for high-value items, and any requested documentation listed in the claim acknowledgement.",
              "Step 4 — Allow our appointed loss adjuster or contractor to inspect the damage; emergency repairs may proceed immediately where they reduce the size of the loss, and reasonable costs are reimbursed.",
              "Step 5 — Settlement is issued once the claim is validated; replacement items are sourced and dispatched directly, and building works are carried out by our approved network contractors.",
            ],
          },
          { p: "Where an item is being replaced under new-for-old cover, replacement is with the nearest equivalent model available at the time of settlement; where the exact item is discontinued, we pay the cost of the closest equivalent specification. Any claim payment is made to you, or jointly to you and any mortgage lender with an interest in the property, within 10 working days of settlement terms being agreed." },
          { p: "Fraudulent claims invalidate the policy from the date of the fraudulent act, and we may report the matter to the police and to the industry claims database. Examples of fraud include exaggerating the value of lost items, listing items that never existed, and staging a loss. Subsequent policies elsewhere may be declined following a fraud marker." },
        ],
      },
      {
        heading: "19. How Sums Insured Are Calculated",
        blocks: [
          { p: "The buildings sum insured is calculated on the rebuilding cost, not the market value, of the property. Rebuilding cost is estimated using the floor area multiplied by the current rebuilding cost per square foot for the construction type and region, plus the cost of demolitions, site clearance, professional fees at 15 per cent of the reinstatement cost, and compliance with current building regulations. Flats in blocks are often insured on a communal basis through the freeholder; contents cover remains your responsibility." },
          { p: "The contents sum insured is the replacement cost as new of everything that would fall out of the house if you turned it upside down. Many households under-insure their clothing, linen and children's toys; a room-by-room inventory is the most reliable method. Sums insured are index-linked at each renewal, meaning they rise automatically in line with the general index of prices applicable to home insurance, so cover does not erode with inflation." },
          { p: "The average provision applies where a sum insured is insufficient: if the contents sum insured is \u00a340,000 but the true replacement cost is \u00a350,000, the home is insured for 80 per cent of its value, and a \u00a310,000 claim would be settled at \u00a38,000 less the excess. Reviewing sums insured annually is the policyholder's responsibility." },
        ],
      },
      {
        heading: "20. Optional Extras",
        blocks: [
          { p: "The Omen Shield policy can be extended with the following optional extras. Each extra is shown separately on the schedule with its own limit and premium, and each can be added or removed at renewal or, subject to administration charges, at any mid-term adjustment." },
          {
            bullets: [
              "Home Emergency — a 24/7 emergency helpline with call-out and temporary repair costs up to \u00a3500 per incident for burst pipes, boiler failure, lock-out, roof damage and pest infestation.",
              "Legal Expenses — up to \u00a350,000 of legal costs for disputes arising from the home, employment of domestic staff, personal injury and consumer disputes.",
              "Specified Bicycle Cover — an individual sum insured for each bicycle, valid away from the home subject to an approved lock.",
              "Excess Waiver — removes the standard \u00a3250 excess in exchange for a small premium loading; specific excesses for flood, subsidence and escape of water still apply.",
              "Home Electrical Extension — covers power surge damage from the public supply and accidental failure of domestic appliances up to \u00a34,000.",
            ],
          },
          { p: "Adding the accidental damage extension is the most popular choice for family households; garden equipment cover limits can be increased to \u00a35,000 where expensive machinery or furniture is present, and the personal possessions section can be extended to worldwide all-risks with no individual territory limit." },
        ],
      },
      {
        heading: "21. Cooling-Off Period",
        blocks: [
          { p: "You may cancel this policy within 14 days of receiving the full policy documentation and receive a full refund of the premium paid, provided no claim has been made and none is pending. This statutory cooling-off period is designed to allow the policy documents to be read and compared with alternatives. Cancellation during the cooling-off period must be notified by letter, email or telephone, and refunds are issued to the original payment method within 10 working days." },
          { p: "If a claim has been made during the cooling-off period, the full premium remains payable for the period of insurance. The cooling-off period applies to new policies, renewals where the contract is re-underwritten, and mid-term adjustments that materially widen cover; it does not apply to pure renewals on unchanged terms." },
        ],
      },
      {
        heading: "22. Renewal and Cancellation",
        blocks: [
          { p: "This policy runs for 12 months. Renewal invitations are issued 21 days before expiry, together with a statement of any changes to premium, cover and terms. If you choose not to renew, take no action and cover will lapse automatically at expiry; there is no obligation to notify us, though we may contact you to confirm. If we choose not to renew, we will give you 21 days' written notice, and any return premium is calculated pro rata." },
          { p: "Mid-term cancellation by you returns premium on a pro rata basis less an administration charge of \u00a335, where no claim has occurred in the current period. Mid-term cancellation by us, following fraud or a material breach of conditions, returns no premium. Where the policy is financed through a credit agreement, cancellation terms of the credit agreement take precedence over the return-premium rules stated here." },
        ],
      },
      {
        heading: "23. Complaints Procedure",
        blocks: [
          { p: "If you have a complaint about this policy, about a claim, or about any service you have received, contact the Omen customer relations team first. Complaints are acknowledged within 5 working days and resolved within 8 weeks, or you will receive an explanation of the delay and an indication of when a decision can be expected. Full details of the complaints procedure, including the fictional Omen Financial Ombudsman referral rights, are set out in the customer charter document." },
          { p: "Complaints about claims handling may be escalated to the independent loss adjuster supervising the claim at any time. Nothing in this procedure affects your legal rights, and the fictional regulatory environment described in these sample documents mirrors a typical consumer-protection regime." },
        ],
      },
      {
        heading: "24. Glossary of Defined Terms",
        blocks: [
          {
            table: {
              cols: ["Term", "Meaning in this wording (fictional)"],
              rows: [
                ["Sum insured", "The maximum amount we will pay for each section in any one period of insurance."],
                ["Excess", "The first amount of each claim that you pay yourself, as set out in Section 16."],
                ["New-for-old", "Replacement of damaged items with new equivalents without deduction for wear and tear."],
                ["Reinstatement", "Rebuilding or repairing the property to a condition substantially the same as new."],
                ["Average", "The provision reducing claim payments in proportion to under-insurance."],
                ["Insured event", "A cause of loss listed in this wording, such as fire, flood or theft."],
                ["Period of insurance", "The 12 months for which cover is provided, as shown on the schedule."],
                ["Index-linking", "Automatic annual adjustment of sums insured in line with the relevant price index."],
              ],
            },
          },
        ],
      },
      {
        heading: "25. Endorsement Schedule and Notes",
        blocks: [
          { p: "Endorsements amend the standard wording to reflect your individual circumstances. Any endorsements applying to your policy are listed on the schedule with a reference number. Sample endorsements include HOM-END-01, removing the 30-day unoccupancy restriction for addresses with house-sitting arrangements; HOM-END-02, increasing the single article limit to \u00a35,000 for specified jewellery; and HOM-END-03, extending personal possessions to worldwide cover with no item limit for photographic equipment." },
          { p: "This sample wording ends with the standard fictional signature block. Omen United Insurance is authorised and regulated by the fictional Omen Financial Conduct Register, firm reference number 000000-SAMPLE. This document is a demonstration artefact: no real cover is provided, no real firm exists, and all figures are illustrative." },
        ],
      },
    ],
  },
  {
    title: "Motor Insurance Comprehensive",
    filename: "Motor-Insurance-Comprehensive.pdf",
    meta: {
      subtitle: "Omen Drive Comprehensive Motor Policy — Wording and Excess Schedule",
      version: "Policy Wording version 2024.2 (Sample)",
      reference: "Sample document MOT-2024-SAMPLE-002",
      pages: 20,
    },
    sections: [
      {
        heading: "1. Important Notice and About This Policy",
        blocks: [
          { p: "This is a SAMPLE document created for demonstration and training purposes only. Omen United Insurance is a fictional insurer and all policy numbers, figures, excesses and addresses are invented. This wording is included in the Omen demo knowledge base to support realistic question answering about motor insurance structure, excesses and claims handling. It must not be relied on as real insurance or legal advice." },
          { p: "The Omen Drive Comprehensive policy covers your private motor car against accidental damage, fire and theft, and provides third party liability protection as required by the fictional Road Traffic Act regime described in these sample documents. The policy is divided into sections describing levels of cover, excesses, claims, and the conditions attached to each. Your certificate of motor insurance and policy schedule together with this wording form the complete contract." },
        ],
      },
      {
        heading: "2. Policy Schedule Explained",
        blocks: [
          { p: "The schedule personalises this wording: it identifies the insured vehicle by registration mark, make, model and VIN; lists the policyholder and any named drivers with their licence details; states the level of cover purchased; and itemises each excess that will be deducted from a claim. Always check that the vehicle description, usage class and registered keeper details are correct, because errors can void cover at the roadside." },
          { p: "The certificate of motor insurance is the document that proves to third parties and to the authorities that compulsory insurance is in place. It shows the registration mark, the cover type, the effective dates and the persons entitled to drive. Certificates can be produced electronically; the fictional Omen mobile application stores a live certificate that updates automatically when the policy changes." },
        ],
      },
      {
        heading: "3. Levels of Cover",
        blocks: [
          { p: "Omen Drive is available at three levels. Third Party Only covers your liability for injury to others and damage to their property, as required by law. Third Party, Fire and Theft adds cover for loss of or damage to your car through fire or theft. Comprehensive cover adds accidental damage to your own car together with the additional benefits described in this wording. The comparison table below summarises the differences." },
          {
            table: {
              cols: ["Benefit", "Third Party", "TP Fire & Theft", "Comprehensive"],
              rows: [
                ["Third party injury and property damage", "Yes", "Yes", "Yes"],
                ["Fire damage to your car", "No", "Yes", "Yes"],
                ["Theft of your car", "No", "Yes", "Yes"],
                ["Accidental damage to your car", "No", "No", "Yes"],
                ["Windscreen and glass cover", "No", "No", "Yes"],
                ["Courtesy car during repairs", "No", "No", "Yes"],
                ["Personal accident benefit", "No", "No", "Yes"],
                ["Personal belongings cover", "No", "No", "\u00a3200"],
                ["Medical expenses", "No", "No", "\u00a3300"],
              ],
            },
          },
          { p: "Comprehensive cover does not mean that every possible loss is insured: the exclusions in Section 14 apply at every level. Conversely, third party policies respond to liability claims made against you, including the defence costs of disputed liability, which can exceed the value of the vehicle many times over." },
        ],
      },
      {
        heading: "4. What Comprehensive Cover Includes",
        blocks: [
          { p: "Comprehensive cover pays for accidental damage to the insured vehicle, however caused, subject to the excesses in Section 5 and the exclusions in Section 14. This includes single-vehicle accidents, collisions with other vehicles, animals or stationary objects, damage in car parks where the responsible party is untraced, and vandalism up to the vehicle's market value. Repairs are carried out by the Omen approved repairer network with a lifetime guarantee on workmanship for as long as you own the car." },
          { p: "Personal accident benefit pays \u00a35,000 for death or specified serious injury of the driver or spouse following a motor accident, and \u00a31,000 for each other injured passenger under the family personal accident extension. Medical expenses up to \u00a3300 per person cover ambulance fees, dressings and private treatment needed after an accident. Personal belongings inside the car are covered up to \u00a3200 in total, excluding items that are themselves insured elsewhere, money, and business goods." },
          { p: "A courtesy car is provided, subject to availability, while the insured car is being repaired by an approved repairer following a valid claim, for up to 14 continuous days. Where the vehicle is a total loss, the courtesy car is provided for up to 7 days from settlement. The courtesy car is a small hatchback of equivalent class; upgrades to a larger vehicle are available at an additional daily rate." },
          { p: "In-car entertainment, navigation equipment and telephone equipment that are permanently fitted are covered as part of the vehicle. Portable equipment that can be removed without tools is covered only under the personal belongings limit. Modified vehicles must be declared; undeclared modifications that increase performance or desirability to thieves may result in claims being declined." },
        ],
      },
      {
        heading: "5. Excesses",
        blocks: [
          { p: "The excess is the amount you contribute towards each claim. The compulsory excess applies to every claim under the policy; voluntary excesses, chosen to reduce premium, are added on top. Specific excesses apply to particular causes of loss and to particular drivers. The total excess deducted from a claim is the sum of all applicable components, and is shown on the schedule before you accept cover." },
          {
            table: {
              cols: ["Excess type", "Amount (sample figures)"],
              rows: [
                ["Compulsory excess — accidental damage", "\u00a3300"],
                ["Voluntary excess (as selected)", "\u00a30 to \u00a3750"],
                ["Theft or attempted theft excess", "\u00a3500"],
                ["Fire excess", "\u00a3300"],
                ["Windscreen repair / replacement", "\u00a375 / \u00a3150"],
                ["Young or inexperienced named driver excess", "\u00a3600"],
                ["Untraced driver (car park) claim excess", "\u00a3300"],
              ],
            },
          },
          { p: "The theft excess of \u00a3500 applies to the theft of, or damage arising from the attempted theft of, the vehicle, and reflects the higher incidence and cost of theft claims. Young and inexperienced named drivers under 25, or drivers who passed their driving test within the past 12 months, attract an additional \u00a3600 excess on any claim occurring while that person is driving. Only one driver-related excess applies per claim, and the highest applicable amount is charged, not a cumulative total." },
        ],
      },
      {
        heading: "6. Theft Cover and Security Requirements",
        blocks: [
          { p: "Theft cover responds when the insured vehicle is stolen, including where it is taken by deception or taken without consent by a person who lives with you, provided a police report is made. The theft excess of \u00a3500 is deducted from the settlement. Vehicles recovered after settlement become our property; vehicles recovered before settlement are repaired where economically viable, with the damage assessed through the approved network." },
          { p: "Security conditions apply to higher-risk vehicles listed on the schedule: these require a Thatcham-approved alarm and immobiliser, or a tracking device, to be fitted and operational. Claims where the security condition was not met — the immobiliser was faulty, or the vehicle was left with the engine running and keys in the ignition — may be declined or reduced, because the condition is a precondition of the theft cover for that vehicle. Keys must never be left in or on the vehicle, including when it is parked on a driveway or when defrosting on cold mornings." },
          { p: "Keys stolen during a house burglary do not invalidate theft cover, but the claim is handled jointly with the home policy, and locks, alarms and immobiliser codes must be replaced at the owner's cost where the vehicle is recovered. Personal belongings stolen with the vehicle are covered under the \u00a3200 belongings limit, subject to evidence of ownership." },
        ],
      },
      {
        heading: "7. Fire Damage",
        blocks: [
          { p: "Fire cover pays for damage to the insured vehicle by fire, explosion, lightning, or self-ignition, and includes the cost of extinguishing the fire and debris removal where the vehicle is destroyed. Electrical fires in the engine bay, fires arising from charging electric vehicles, and fires spreading from adjacent vehicles are all covered causes. The fire excess is \u00a3300." },
          { p: "The vehicle's market value at the date of loss is the maximum payable for fire or theft claims where the vehicle is not recovered or is uneconomic to repair. Market value is assessed using fictional industry valuation guides adjusted for mileage, condition and service history; improvements such as aftermarket wheels are included only where declared and paid for at inception." },
        ],
      },
      {
        heading: "8. Windscreen and Glass",
        blocks: [
          { p: "Windscreen cover is included under comprehensive policies. A chip repair costs you only the \u00a375 repair excess and does not affect your no-claims discount; a full replacement carries a \u00a3150 excess. Repair is preferred where technically possible, because repairs preserve the factory seal of the screen and are completed within an hour. Our glass network offers mobile repair at your home or workplace." },
          { p: "Glass cover extends to the windscreen, side windows, and glass sunroof; body panels are repaired as accidental damage. Where a screen is replaced, the camera recalibration required by modern driver-assistance systems is included at no extra cost. Claims where only the glass is damaged are settled without the standard compulsory excess applying." },
        ],
      },
      {
        heading: "9. Courtesy Car and Additional Benefits",
        blocks: [
          { p: "The courtesy car benefit provides a small hatchback while your car is off the road following a valid claim. Cover begins the day repairs start and ends 14 days later or on completion, whichever is earlier. If your car is written off, the courtesy car is available for 7 days after settlement. The benefit does not apply where the claim is declined, where the vehicle is stolen and not recovered, or where the loss involves only personal belongings." },
          { p: "Additional benefits under comprehensive cover include overnight accommodation or onward travel after an accident more than 50 miles from home, up to \u00a3400; replacement child seat cover of \u00a3150 where a seat was involved in an accident, because damaged seats must be replaced even where damage is invisible; and coverage of reasonable costs to collect the vehicle if you are medically unfit to drive after an accident." },
        ],
      },
      {
        heading: "10. Named Drivers",
        blocks: [
          { p: "Named drivers are persons other than the policyholder who are entitled to drive the insured car. Adding a named driver changes the premium to reflect their age, experience, claims record and licence type. A named driver can be added or removed at any time through a mid-term adjustment; the change takes effect immediately once processed, and documents are reissued the same day." },
          { p: "Named drivers do not accumulate their own no-claims discount on this policy; discounts are earned by the policyholder only. A named driver who subsequently takes out their own policy may request a proof of claims experience letter, which some fictional insurers credit as an introductory discount. Drivers under 25, and drivers who have held a full licence for less than 12 months, attract the young or inexperienced driver excess of \u00a3600 on any claim while they are driving." },
          { p: "Any person who drives the car more than occasionally must be declared; undeclared regular drivers void cover for claims occurring while they drive. The policyholder's spouse or partner may hold a driving-other-cars extension on their own separate policy, but such cover is third party only and never extends to the insured car itself under this wording." },
        ],
      },
      {
        heading: "11. No-Claims Discount",
        blocks: [
          { p: "The no-claims discount (NCD) grows for each claim-free year of driving, in steps shown in the table below. The discount is expressed as a percentage reduction from the base premium at renewal. One fault claim moves you back two steps; two fault claims in one year remove the discount entirely. Non-fault claims — where the responsible party is identified and their insurer pays in full — do not affect the discount, which is why uninsured loss recovery and driver protection services matter." },
          {
            table: {
              cols: ["Claim-free years", "NCD step", "Discount"],
              rows: [
                ["0 years", "Step 0", "0%"],
                ["1 year", "Step 1", "10%"],
                ["2 years", "Step 2", "20%"],
                ["3 years", "Step 3", "30%"],
                ["4 years", "Step 4", "40%"],
                ["5+ years", "Step 5 (maximum)", "55%"],
              ],
            },
          },
          { p: "NCD protection, purchased as an extra, allows one fault claim during the protected period without the step-back applying; step-back protection allows two fault claims over three years before the discount is reduced. Protected discount is not available above step 4 in the first year of protection. NCD must be evidenced by a proof of discount from the previous fictional insurer at inception." },
        ],
      },
      {
        heading: "12. Usage Classes",
        blocks: [
          { p: "The usage class on the schedule describes how the vehicle is used, and driving outside the declared class voids cover. Social, domestic and pleasure (SDP) covers everyday private driving including shopping, visiting friends and the school run. SDP plus commuting adds travel to and from a single fixed place of work, including parking there. Business use adds driving to multiple sites in connection with the policyholder's work; commercial travelling and carriage of goods for hire and reward require separate commercial policies." },
          { p: "Commuting cover includes a regular park-and-ride station car park and shared commuting in the insured vehicle as part of a formal car-sharing arrangement with colleagues. It does not include delivery driving, taxi or courier work of any kind, or use of the vehicle as a tool of trade by tradespeople — all of which require commercial cover. If your pattern of use changes, notify us so the usage class can be corrected before an incident exposes the gap." },
        ],
      },
      {
        heading: "13. Motor Claims Procedure",
        blocks: [
          { p: "Claims should be notified as soon as possible after the event; there is no fixed deadline, but late notification can prejudice recovery from third parties and may reduce what we can pay. The claim journey follows the steps below." },
          {
            bullets: [
              "Step 1 — Make the scene safe, exchange details with other parties, and photograph vehicles, registration plates, positions and the road environment before moving.",
              "Step 2 — Report injuries to the police where anyone is hurt, where a driver leaves the scene without exchanging details, or where debris obstructs the highway.",
              "Step 3 — Notify the claim through the Omen claims line or the mobile app; an acknowledgement with a claim reference is issued within 24 hours.",
              "Step 4 — Deliver the vehicle to an approved repairer for damage claims; photographs of the damage uploaded through the app often allow an initial estimate without an inspection.",
              "Step 5 — Settlement or repair completion; for liability claims, the third-party insurers are contacted and negotiations handled by our claims team.",
            ],
          },
          { p: "How long does a motor insurance claim take? Where liability is clear and the vehicle is repairable, the target is: acknowledgement within 24 hours, an initial estimate within 3 working days of inspection, repairs beginning within 5 working days of authorisation, and settlement of total-loss claims within 10 working days of the vehicle being inspected and the market value agreed. Where liability is disputed, or injuries are involved, negotiation with other insurers and medical reporting typically extends the timeline to between 3 and 9 months. Third-party injury claims can take longer where long-term prognosis is uncertain; interim payments are made where liability is admitted." },
          { p: "Total-loss settlement uses the vehicle's market value at the date of loss, evidenced by fictional trade guides and advertised comparable vehicles. Any outstanding finance on the vehicle is settled first, and any balance is paid to you. Vehicle excise duty is refunded for the full remaining months directly by the fictional licensing authority once the vehicle is declared destroyed." },
        ],
      },
      {
        heading: "14. Exclusions",
        blocks: [
          { p: "The following exclusions apply to all sections of this policy. The list exists to keep the product affordable and to exclude driving activities that fall outside private motoring." },
          {
            bullets: [
              "Use of the vehicle for racing, pace-making, speed testing, track days or any motorsport event.",
              "Driving while under the influence of alcohol or drugs above the prescribed fictional limits.",
              "Driving without a valid licence appropriate to the vehicle, or while disqualified.",
              "Loss of value following repair, betterment, and mechanical or electrical breakdown of the vehicle itself.",
              "Wear and tear, depreciation, and damage from lack of maintenance, including tyre wear below the legal minimum.",
              "Carriage of goods for hire and reward and any commercial delivery or courier use.",
              "Terrorism, war, and radioactive contamination.",
              "Theft by a person who holds a key obtained with your consent, including deception at the point of sale of the vehicle.",
              "Damage to the vehicle while being driven by an undeclared regular driver.",
            ],
          },
        ],
      },
      {
        heading: "15. Approved Repairer Network",
        blocks: [
          { p: "The Omen approved repairer network consists of bodyshops audited annually for equipment, technician certification and quality of finish. Repairs carried out by the network carry a lifetime guarantee for as long as you own the vehicle, including paintwork and structural work. Using the network speeds the claim: images are exchanged digitally, authorisations are typically issued the same day, and courtesy cars are arranged at drop-off." },
          { p: "You may use a repairer of your choice, but the claim will be assessed on the basis of an independent engineer's inspection, and any cost above the engineer's approved figure is borne by you. Direct-to-insurer glass claims bypass this process and are routed entirely through the glass network." },
        ],
      },
      {
        heading: "16. Total Loss and Market Value",
        blocks: [
          { p: "A vehicle is declared a total loss when the cost of repair plus associated charges exceeds its market value. The market value at the date of loss is assessed from fictional trade guides, recent advertised prices for the same model, age and mileage, and the vehicle's condition before the accident. Accessories and modifications are included only where declared at inception or by later endorsement." },
          { p: "Where the vehicle is on finance, settlement is paid to the finance company first; where finance exceeds the vehicle's value, gap cover — if purchased — pays the shortfall up to its own limit. The vehicle's registration mark is transferred to us on total-loss settlement, and you must send the registration document, keys and any service records to the claims team." },
        ],
      },
      {
        heading: "17. Renewal, Cancellation and Cooling-Off",
        blocks: [
          { p: "Renewal terms are offered 21 days before expiry. The renewal premium reflects claims, convictions and any change of vehicle or drivers declared during the year, together with general market movements. Continuous insurance laws in the fictional regime require an active policy or a statutory off-road notification whenever a registered vehicle is kept; lapses attract fixed penalties." },
          { p: "You may cancel within 14 days of receiving the initial documentation for a full refund where no claim has occurred. Mid-term cancellation refunds premium pro rata minus an administration fee of \u00a340; cancellation after a fault claim returns no premium for the remainder of the period. Refunds are calculated on the unexpired portion of the premium net of insurance premium tax." },
        ],
      },
      {
        heading: "18. Motor Legal Protection (Optional Add-On)",
        blocks: [
          { p: "Motor legal protection covers up to \u00a3100,000 of legal costs to recover uninsured losses after a non-fault accident: your policy excess, the cost of alternative transport, loss of earnings, and personal injury compensation. Cover includes a helpline for any legal question connected with motoring, and representation where a prosecution follows an accident." },
          { p: "The add-on responds only where the prospect of recovery is reasonable; where the third party is untraced or uninsured, recovery action is not available and the fictional compensation body for uninsured losses is the only route for injury claims. Legal protection is annual, mirrors the motor policy dates, and covers the policyholder and named drivers." },
        ],
      },
      {
        heading: "19. Breakdown Cover (Optional Add-On)",
        blocks: [
          { p: "Omen Rescue provides roadside assistance, recovery of the vehicle and up to four passengers to any single destination, home assistance when the vehicle fails at home, and onward travel. The rescue service responds within an average of 45 minutes; vehicles immobile following an accident are recovered under the accident claim rather than the breakdown service." },
          { p: "The breakdown add-on covers the insured vehicle, not the driver, and includes misfuelling, flat batteries, lost keys, and punctures where no serviceable spare is carried. European extension adds 90 days of the same cover while touring on the fictional continent, including repatriation of the vehicle when it cannot be repaired locally in time." },
        ],
      },
      {
        heading: "20. Glossary",
        blocks: [
          {
            table: {
              cols: ["Term", "Meaning in this wording (fictional)"],
              rows: [
                ["Market value", "The value of the vehicle immediately before the loss, assessed from guides and comparables."],
                ["Fault claim", "A claim where you or a named driver is wholly or partly to blame."],
                ["Excess", "Your contribution to a claim, comprising compulsory, voluntary and specific components."],
                ["NCD", "No-claims discount earned by claim-free years, applied as a premium percentage."],
                ["Total loss", "Where repair cost plus charges exceeds market value."],
                ["Usage class", "The description of how the vehicle is used, shown on the schedule."],
              ],
            },
          },
          { p: "Omen United Insurance, motor division, is a fictional undertaking registered in the Omen sample register, firm reference 000000-SAMPLE-MOT. This document ends the sample motor wording; all figures are illustrative and no real cover exists." },
        ],
      },
    ],
  },
  {
    title: "Life & Health Plans Guide",
    filename: "Life-Health-Plans-Guide.pdf",
    meta: {
      subtitle: "Omen Life and Health Protection Plans — Customer Guide",
      version: "Guide version 2024.1 (Sample)",
      reference: "Sample document LIFE-2024-SAMPLE-003",
      pages: 18,
    },
    sections: [
      {
        heading: "1. About This Guide",
        blocks: [
          { p: "This is a SAMPLE document created for demonstration and training purposes only. Omen United Insurance is a fictional insurer, and every plan name, figure, limit and address in this guide is invented. The guide describes the fictional Omen life and health protection range at a summary level so that assistants in the Omen demo knowledge base can answer questions about how these plans work. It is not financial or medical advice, and no real coverage exists." },
          { p: "The Omen protection range comprises four plan families: term life insurance, which pays a lump sum on death during a fixed term; whole of life insurance, which covers you whenever death occurs; critical illness cover, which pays a lump sum on diagnosis of a listed condition; and income protection, which replaces a portion of earnings during long illness. A complementary health plan pays fixed cash benefits toward hospital treatment and everyday healthcare costs." },
          { p: "Choosing between the families depends on what you are protecting: a mortgage is best matched to decreasing term insurance; dependants' future costs suit level term or whole of life; loss of earnings through sickness suits income protection; and treatment costs suit the health plan. The sections below describe each family, the benefit tables, waiting periods, claim documentation, exclusions and the optional riders available." },
        ],
      },
      {
        heading: "2. Term Life Insurance",
        blocks: [
          { p: "Term life insurance pays the sum assured if the life assured dies during the policy term. Level term insurance keeps the same sum assured throughout; decreasing term insurance reduces the sum assured each year on a schedule that mirrors a repayment mortgage balance. Premiums are guaranteed and fixed for the whole term at outset, and the policy has no cash value if you stop paying premiums or survive to the end of the term." },
          { p: "Terms from 5 to 40 years are available, ending no later than age 85. The minimum sum assured is \u00a350,000 for level term plans. Joint life plans cover two lives and pay once, on the first death; after that claim the policy ends. Where both partners need independent cover, two single policies usually cost little more than one joint policy and pay out twice." },
          {
            table: {
              cols: ["Age at entry", "Level term 20 years", "Decreasing term 25 years"],
              rows: [
                ["30 next birthday", "\u00a38.40 monthly per \u00a3100,000", "\u00a36.10 monthly per \u00a3100,000"],
                ["40 next birthday", "\u00a315.20 monthly per \u00a3100,000", "\u00a311.80 monthly per \u00a3100,000"],
                ["50 next birthday", "\u00a336.70 monthly per \u00a3100,000", "\u00a329.40 monthly per \u00a3100,000"],
              ],
            },
          },
          { p: "The sample figures above are fictional monthly premiums for a non-smoker in ordinary health; smokers pay roughly double, and hazardous occupations and pastimes attract loadings set at underwriting. Waiver of premium, described with the other riders in Section 13, keeps the policy in force if illness stops you working." },
        ],
      },
      {
        heading: "3. Whole of Life Insurance",
        blocks: [
          { p: "Whole of life insurance pays the sum assured whenever the life assured dies, provided premiums are maintained to the review age. Because a claim is certain rather than possible, whole of life costs more than term insurance for the same sum assured. It is commonly used for funeral planning and to pass a defined sum to beneficiaries outside of an estate's liquid assets." },
          { p: "Omen whole of life plans are reviewable: at ages 70 and 85 the premium or the sum assured is reviewed against the plan's fictional investment performance. Balanced-of-life cover with guaranteed acceptance is available without medical questions between ages 50 and 80, with a first-two-years accident-only limitation — death by illness within the first 24 months returns premiums paid rather than the sum assured." },
        ],
      },
      {
        heading: "4. Critical Illness Cover",
        blocks: [
          { p: "Critical illness cover pays the full sum assured on diagnosis of one of the listed conditions at a defined severity. Children's critical illness is included at no extra cost, paying 50 per cent of the adult sum assured or \u00a325,000, whichever is lower, without reducing the adult cover. The plan pays once and then ends." },
          { p: "The Omen list of fictional covered conditions includes: heart attack of specified severity; stroke with persisting symptoms; cancers classified as invasive and staging onwards — non-invasive skin cancers and early-stage prostate cancers are covered at 25 per cent severity; multiple sclerosis with continuing symptoms; kidney failure requiring dialysis; major organ transplant; permanent total disability preventing any occupation; blindness; deafness; loss of limbs; paralysis; coma; third-degree burns over 20 per cent of body area; coronary artery bypass surgery; aorta graft surgery; benign brain tumour; motor neurone disease; Parkinson's disease; bacterial meningitis; Creutzfeldt-Jakob disease; encephalitis; head injury; intensive care benefit; and partial payment conditions including early-stage prostate cancer, ductal carcinoma in situ, and low-grade prostate cancers." },
          { p: "Survival periods apply: a claim is payable only if the life assured survives 14 days after diagnosis of a critical illness, and 28 days for total permanent disability claims. Claims are assessed against the severity definitions in this guide's schedule; diagnoses that meet the diagnostic threshold of the fictional medical literature but not the severity definition are deferred rather than declined, with reassessment at intervals offered by the claims team." },
        ],
      },
      {
        heading: "5. Income Protection",
        blocks: [
          { p: "Income protection pays a monthly benefit replacing up to 60 per cent of gross earnings if illness or injury prevents you from doing your own occupation. Benefits begin after the deferred period you choose — 4, 8, 13, 26 or 52 weeks; shorter deferred periods cost more because claims start sooner. The benefit continues until you return to work, retire, or the policy term ends, with premiums waived while a claim is being paid." },
          { p: "Omen income protection uses an own-occupation definition for office-based workers and a suited-occupation definition for manual trades. The monthly benefit is level or escalates at 3 per cent per year in claim; deferred periods align with your employer's sick pay where applicable. Housepersons' cover pays a weekly benefit where illness prevents performing normal domestic tasks." },
          { p: "Premiums are guaranteed for the first five years and reviewable thereafter. The plan excludes deliberate self-injury and normal pregnancy, and a pre-existing conditions limitation described in Section 10 applies during the first 24 months. Rehabilitation support — graduated return-to-work programmes and workplace adjustments — is funded by the plan, because early supported return improves outcomes for everyone." },
        ],
      },
      {
        heading: "6. Omen Health Plan — Benefit Table",
        blocks: [
          { p: "The Omen Health Plan is a cash-plan style product paying fixed contributions toward everyday healthcare. It is not private medical insurance: it does not fund treatment directly, but reimburses cash benefits up to annual maximums per benefit type. Cover is available for adults and children, with premiums guaranteed for the first two years of membership." },
          {
            table: {
              cols: ["Benefit", "Annual maximum", "Waiting period"],
              rows: [
                ["Inpatient hospital nights", "\u00a360 per night, up to 30 nights", "None"],
                ["Day surgery", "\u00a3150 per treatment, up to \u00a3450", "3 months"],
                ["Outpatient consultant fees", "\u00a3100 per visit, up to \u00a3800", "3 months"],
                ["Diagnostic imaging", "\u00a3150 per scan, up to \u00a3450", "3 months"],
                ["Physiotherapy", "\u00a330 per session, up to \u00a3360", "3 months"],
                ["Dental", "\u00a3150 per benefit year", "3 months"],
                ["Optical", "\u00a3100 per benefit year", "3 months"],
                ["Consultations with a GP", "\u00a345 per call, up to \u00a3320", "None"],
              ],
            },
          },
          { p: "The benefit year runs with your membership year, not the calendar year, so benefits renew on the anniversary of joining. Claims are submitted through the Omen member portal with a photograph of the paid receipt; benefits are paid within 5 working days of a complete claim. Accumulative no-claims benefits increase the dental and optical maximums by \u00a325 for each claim-free year, up to a ceiling of \u00a3250." },
        ],
      },
      {
        heading: "7. How Premiums Work",
        blocks: [
          { p: "Premiums for all Omen protection plans are calculated from age, sex where the fictional regime permits its use, smoking status, health history, family history, occupation, and the cover chosen. Guaranteed premiums never change; reviewable premiums change at stated points. Waiver of premium adds roughly 3 to 5 per cent to cost; indexation, increasing the sum assured with inflation, adds a similar order and keeps the real value of cover stable over long terms." },
          { p: "Payment is monthly by direct debit or annually by card; annual payment attracts a 5 per cent discount. A 30-day grace period applies to every payment due: if a premium is missed, cover continues for 30 days while the payment is retried. If the premium remains unpaid after the grace period the policy lapses, and reinstatement terms appear in Section 14." },
        ],
      },
      {
        heading: "8. Waiting Periods",
        blocks: [
          { p: "Waiting periods prevent claims for conditions that already exist or are already being investigated at the time cover starts. The health plan's waiting periods are shown in the benefit table in Section 6: hospital inpatient nights are payable immediately, while surgical and outpatient benefits begin after 3 months of continuous membership. Accidental injury claims are exempt from all waiting periods and are payable from day one." },
          { p: "For critical illness and income protection, the relevant limitation is the pre-existing condition exclusion described in Section 10 rather than a simple waiting period, together with the survival periods described in Section 4. For whole of life guaranteed acceptance plans, the first 24 months limit illness claims to a return of premiums. Life insurance term cover has no waiting period at all: once the policy is accepted and the first premium collected, the full sum assured is in force from day one." },
        ],
      },
      {
        heading: "9. Claim Documentation",
        blocks: [
          { p: "Every claim begins with the Omen claims team sending the correct claim form for the plan claimed under. The documentation differs by plan, and the lists below describe the standard fictional requirements. Claims are acknowledged within 5 working days and decided within 10 working days of receiving complete documentation, or within the statutory industry timescales of the fictional regime, whichever is shorter." },
          { p: "Life insurance claim — the documents needed for a life insurance claim are: an original or certified copy of the death certificate; the policy document or policy schedule; the completed claimant's statement; proof of the claimant's identity and authority (grant of probate or letters of administration, or the trustee deed where the policy was written in trust); and, where death was accidental or the coroner was involved, the coroner's certificate. Additional medical evidence is requested only where death occurs within the first two policy years, to confirm answers given at application." },
          {
            bullets: [
              "Critical illness claim — consultant's letter confirming the diagnosis, histology or imaging reports for cancer claims, and the completed claim form; the attending physician's report is obtained directly by the claims team.",
              "Income protection claim — first fit note or hospital discharge summary, employer's sickness certificate where statutory pay applies, and P60 or payslips evidencing pre-claim earnings.",
              "Health plan claim — paid receipts and, for inpatient nights, the hospital admission and discharge summary.",
            ],
          },
          { p: "Payment is made by transfer to the claimant's account. Where a policy was written in trust, payment follows the trustee's instruction; where no trust exists, payment forms part of the deceased's estate and follows the will or the fictional intestacy rules." },
        ],
      },
      {
        heading: "10. Exclusions",
        blocks: [
          { p: "The exclusions below apply to the protection range. They are disclosed in full at application, and each application question must be answered accurately, because the fictional duty of disclosure allows the insurer to avoid the policy for non-disclosure of material facts." },
          {
            bullets: [
              "Suicide or attempted suicide within the first 12 months of a life or critical illness policy.",
              "Pre-existing conditions: conditions for which advice, treatment or investigation was received in the 24 months before the start date are excluded until 24 months of continuous cover have elapsed, after which they are covered.",
              "Self-inflicted injury; involvement in criminal acts; war and civil war.",
              "Hazardous pastimes declared and excluded by endorsement, such as competitive motorsport, mountaineering above 4,000 metres and deep diving below 40 metres.",
              "Alcohol or solvent abuse and the consequences of drug misuse other than drugs prescribed by a fictional registered practitioner.",
              "Aviation other than as a fare-paying passenger in a licensed aircraft.",
              "Cosmetic surgery that is not reconstructive following accident or cancer treatment.",
              "Normal pregnancy and childbirth for income protection, except where complications arise that meet the incapacity definition.",
            ],
          },
        ],
      },
      {
        heading: "11. Beneficiaries and Writing a Policy in Trust",
        blocks: [
          { p: "A life policy written in trust pays the sum assured directly to the beneficiaries named in the trust deed, outside the deceased's estate. This avoids fictional inheritance tax on the proceeds, avoids delays in probate, and ensures the money reaches the intended people even where the will says otherwise. Omen provides a simple trust form with every life and critical illness policy, and the claims team will help trustees complete a claim." },
          { p: "Where no trust exists, the proceeds are paid to the estate and distributed by the executors under the will. Assignments to lenders are honoured first where a mortgage protection policy has been assigned: the lender receives the outstanding balance and any excess goes to the estate. Changing beneficiaries after a divorce or family change requires a new trust deed; beneficiary nominations on non-trust policies are expressions of wish only." },
        ],
      },
      {
        heading: "12. Riders and Options",
        blocks: [
          {
            bullets: [
              "Waiver of premium — after 26 weeks of incapacity the insurer pays your premiums until you return to work or the term ends, keeping cover in force precisely when money is tightest.",
              "Indexation — the sum assured and premiums rise each year with the fictional retail prices index, preventing the erosion of the real value of the sum assured.",
              "Accidental death benefit rider — pays an additional sum equal to the basic sum assured where death results from an accident, at a small additional premium.",
              "Children's critical illness — automatically included, paying up to \u00a325,000 or 50 per cent of the sum assured for listed childhood conditions without reducing adult cover.",
              "Fracture cover — fixed cash payments for specified bone fractures, regardless of hospital admission.",
              "Guaranteed insurability — allows increasing the sum assured at marriage, childbirth, house purchase or salary increase without further medical underwriting, up to stated limits.",
            ],
          },
          { p: "Riders are elected at outset and evidenced on the schedule; some can be added later without underwriting, others require it. The guaranteed insurability option is time-limited: each increase must be requested within 6 months of the qualifying event, and each event may be used once." },
        ],
      },
      {
        heading: "13. Lapse and Reinstatement",
        blocks: [
          { p: "If premiums remain unpaid after the 30-day grace period, the policy lapses and cover ends at the point the grace period expired. Within 12 months of lapsing, a policy may be reinstated on payment of all overdue premiums and confirmation that no illness or injury affecting the risk has arisen in the interim; medical evidence may be requested. After 12 months a new application with fresh underwriting is the only route." },
          { p: "Term insurance has no cash-in value at any point: it is pure protection. Whole of life plans accumulated under the fictional balanced fund contain a surrender value after 24 months, payable on request. Surrender values are not equal to premiums paid, and surrender terminates cover; where a whole of life plan is no longer needed, converting to paid-up cover, if available, preserves a reduced sum assured without further premiums." },
        ],
      },
      {
        heading: "14. Tax Treatment (Fictional)",
        blocks: [
          { p: "In the fictional regime described by this sample guide, life insurance proceeds paid on death are free of personal income tax, and policies written in trust can keep proceeds outside the taxable estate. Critical illness lump sums are likewise free of income tax. Income protection benefits are taxable as earnings in the hands of the recipient, which is why the benefit is limited to 60 per cent of gross earnings — the net effect approximates full net salary replacement. Health plan cash benefits are not taxable where they reimburse expenses actually incurred and evidenced." },
          { p: "Premiums are generally not deductible against fictional income tax for individuals. Where a policy is purchased by a fictional employer for an employee, the tax treatment differs and the plan documents should be read alongside the employer's arrangements. The fictional tax code may change; this guide describes the treatment as at its stated version date only." },
        ],
      },
      {
        heading: "15. Health and Wellness Membership",
        blocks: [
          { p: "Every protection plan includes Omen Vitality membership, the fictional wellness programme. Vitality awards points for exercise recorded on connected devices, health screenings, and gym attendance, and points translate into premium reductions at renewal of up to 15 per cent for the most engaged members. A cinema ticket and monthly coffee benefit, with fictional partners, rewards healthy behaviour more frequently than the annual discount." },
          { p: "Wellness benefits are part of the product rather than an add-on and cannot be removed for a discount. They operate for the policyholder and spouse only, and require consent for the connected device data to be processed for the programme, separately from claims data. Participation is voluntary and refusal does not affect claim eligibility in any way." },
        ],
      },
      {
        heading: "16. Free-Look Period and Membership Cancellation",
        blocks: [
          { p: "A 14-day free-look period applies to every new plan: if you return the documents within 14 days of receiving them, all premiums are refunded in full, provided no claim has been made. For the health plan, cancellation after the free-look period ends membership at the next month end; benefits already claimed are retained and premiums for the elapsed month are not refunded. For protection plans, mid-term cancellation returns no premium where cover has been in force, because pure protection is not a savings product." },
          { p: "Members moving abroad may continue health plan cover for 90 days of temporary residence; permanent emigration ends membership because the benefit network is domestic. Protection plans continue wherever you live, provided the direct debit remains payable in the plan's fictional currency." },
        ],
      },
      {
        heading: "17. Frequently Asked Questions",
        blocks: [
          { qa: { q: "What documents do I need for a life insurance claim?", a: "An original or certified death certificate, the policy schedule, the completed claimant's statement, and proof of your authority — probate, letters of administration or the trust deed. Where death occurs within the first two years, we may also request medical records covering the application period." } },
          { qa: { q: "Does critical illness cover pay for early-stage cancer?", a: "Early-stage and non-invasive cancers receive the partial payment of 25 per cent of the sum assured, up to the plan's partial payment ceiling, and the plan continues in force for the remaining sum assured." } },
          { qa: { q: "Can I cover my children?", a: "Children's critical illness is included automatically in adult critical illness plans, paying up to \u00a325,000 or 50 per cent of the sum assured. Child term assurance may be added for a small premium where the main plan is a life policy." } },
          { qa: { q: "What happens if I miss a premium?", a: "You have a 30-day grace period during which cover continues. If the premium remains unpaid after that, the policy lapses. Within 12 months you can reinstate on payment of arrears, subject to health confirmation." } },
        ],
      },
      {
        heading: "18. Glossary and Closing",
        blocks: [
          {
            table: {
              cols: ["Term", "Meaning (fictional)"],
              rows: [
                ["Sum assured", "The lump sum payable on a valid claim."],
                ["Deferred period", "The wait before income protection benefits begin."],
                ["Survival period", "Days the life assured must survive after diagnosis for a claim to qualify."],
                ["Trust", "A legal arrangement directing policy proceeds to chosen beneficiaries."],
                ["Grace period", "30 days after a missed premium during which cover continues."],
                ["Pre-existing condition", "Condition treated or investigated in the 24 months before start."],
              ],
            },
          },
          { p: "Omen Life and Health is the fictional protection division of Omen United Insurance, sample firm reference 000000-SAMPLE-LIFE. This guide is a demonstration artefact for the Omen knowledge base; no real coverage, entity or advice exists, and every figure is illustrative." },
        ],
      },
    ],
  },
];
