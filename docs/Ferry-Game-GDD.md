Ferry Game

Game Design Document (v0.3 — updated 2026-07-01: added weekly/seasonal rhythm, contracts, loans & resale, goals, platform & session design, visual direction; concretized community growth and maintenance)

⸻

High Concept

A cozy-but-deep ferry management simulation inspired by Washington State Ferries, SimAirport, Mini Metro, RollerCoaster Tycoon, Port Royale, and Lemonade Tycoon.

Players build and operate a regional ferry network, balancing logistics, finances, staffing, maintenance, and community growth. Rather than driving ferries directly, players design an efficient transportation system that enables an entire region to thrive.

⸻

Core Design Pillars

Meaningful Logistics

Every decision creates ripple effects across the simulation.

Changing a sailing schedule may:

* Increase revenue
* Increase fuel costs
* Reduce customer wait times
* Increase crew fatigue
* Improve community growth

The game rewards thoughtful optimization rather than perfect execution.

⸻

Human Management

Transportation is ultimately about people.

Players manage:

* Captains
* Engineers
* Deckhands
* Office staff
* Terminal improvements

Crew morale directly affects operational performance.

⸻

Organic Community Growth

Communities respond to transportation.

Reliable ferry service encourages population growth, tourism, industry, and commerce.

Players don’t build cities directly—they create the conditions for them to evolve naturally.

⸻

Calm Strategy

No combat.

No twitch mechanics.

The challenge comes from balancing interconnected systems and watching the network evolve.

⸻

Core Gameplay Loop

Research demand

↓

Purchase vessels

↓

Hire crew

↓

Assign captains

↓

Create schedules

↓

Transport passengers, vehicles, and freight

↓

Generate revenue

↓

Pay expenses

↓

Maintain fleet

↓

Improve customer satisfaction

↓

Communities develop

↓

Unlock new opportunities

↓

Expand the ferry network

⸻

Primary Game Systems

⸻

Demand Simulation

Demand drives the entire transportation network.

Rather than spawning a fixed number of passengers, every community continuously generates travel demand based on its population, economy, attractions, and current conditions.

The player’s decisions can increase, redirect, or reshape that demand over time.

⸻

Types of Demand

Foot Passengers

* Daily commuters
* Tourists
* Students
* Local residents

Personal Vehicles

* Commuters
* Families
* RVs
* Campers

Commercial Freight

* Logging trucks
* Fuel tankers
* Food deliveries
* Construction equipment
* Industrial freight

Each category has different behaviors, including price sensitivity, patience, and scheduling needs.

⸻

Natural Demand

Generated automatically from:

* Population
* Residential density
* Tourism
* Industry
* Commercial activity
* Geographic isolation

Dynamic events temporarily modify demand:

* Orca sightings
* Festivals
* County fairs
* Cruise ship arrivals
* Holiday weekends
* Weather events
* Highway closures

Events are announced a short time ahead (e.g. a day) so the player can react — adding a sailing, repositioning a vessel, or raising prices. Reacting well is rewarded; events are the main mechanic that tests adaptation rather than steady-state optimization.

⸻

Weekly & Seasonal Rhythm

Demand must not be identical every day — a timetable that is optimal once should not stay optimal forever.

Weekly cycle:

* Commuter demand peaks on weekdays and drops sharply on weekends
* Tourist demand surges on weekends
* Freight runs steadily on weekdays

This forces a real scheduling question: run one compromise timetable, or maintain separate weekday and weekend schedules?

Seasonal cycle:

* Tourist volume swells in summer and collapses in winter
* Weather (later phases) degrades reliability in the off-season

Seasons create a yearly re-planning rhythm: fleet sizing becomes a decision that repeats (keep the big vessel through winter and eat its upkeep, or sell it and rebuy in spring?). Seasonality is deliberately built on the existing per-segment demand model — it multiplies segment volume rather than adding a new system.

⸻

Service-Induced Demand

Better service creates additional demand.

Factors include:

* Sailing frequency
* Reliability
* Short wait times
* Travel time
* Customer satisfaction
* Available capacity

Better transportation encourages additional travel rather than simply serving existing travelers.

⸻

Player-Influenced Demand

Players can intentionally shape regional demand.

Advertising

Campaign examples:

* Tourism
* Weekend Getaways
* Freight & Commerce
* Commuter Awareness
* Eco-Friendly Ferry Service
* Local Events

Advertising is most effective when paired with quality ferry service.

Future research may improve advertising effectiveness and reveal underserved markets.

⸻

Community Development

Communities develop identities over time.

Possible development focuses:

* Tourism
* Industry
* Residential
* Commercial
* Fishing
* Agriculture
* Shipping Port

Player decisions—including advertising, ferry frequency, cargo investment, and terminal upgrades—influence how towns evolve.

Example:

Heavy passenger investment and tourism advertising may transform a quiet island into a resort destination.

Freight investment and industrial service may instead create a thriving shipping town.

Growing communities generate new transportation needs, creating a continuous feedback loop.

⸻

Route Demand Factors

Demand on each route is influenced by:

* Population
* Destination attractiveness
* Sailing frequency
* Ticket prices
* Community affluence
* Wait times
* Travel time
* Reliability
* Customer satisfaction
* Company reputation
* Seasonal effects
* Current events

Vehicles are less tolerant of long waits and may abandon trips.

Commercial freight values reliability more than speed.

⸻

Community Feedback Loop

Community Growth

↓

Travel Demand

↓

Revenue

↓

Fleet Expansion

↓

Improved Service

↓

More Community Growth

This positive feedback loop forms the heart of the simulation.

Concrete mechanic:

* Each community's population and destination appeal are living state, not fixed numbers
* A periodic growth tick (weekly) adjusts them based on how well the community was served: reputation, share of demand actually carried, and capacity headroom
* Well-served communities grow; neglected ones stagnate or shrink
* Growth is visible on the map (town tiers / size) so long-term investment feels witnessed, not abstract

Community identity emerges from *which segments* you serve: per-segment growth means heavy tourist service grows a town's tourist appeal, while freight investment grows its industrial base — the identity system is the same mechanism, applied per segment.

⸻

Fleet Management

Every vessel has:

* Passenger capacity
* Vehicle capacity
* Cargo capacity
* Fuel efficiency
* Speed
* Age
* Maintenance condition
* Reliability

Older ferries become increasingly expensive to maintain and are more prone to breakdowns.

⸻

Crew Management

Every vessel requires staffing.

Possible positions:

* Captain
* First Officer
* Chief Engineer
* Engineer
* Deckhand

Each crew member tracks:

* Experience
* Wage
* Fatigue
* Happiness

⸻

Staffing Levels

Each vessel has:

* Minimum Crew
* Recommended Crew
* Fully Staffed

Operating with minimum staffing reduces costs but increases fatigue and operational risk.

Implementation is phased: crew arrives first as a coarse per-vessel staffing tier (minimum / recommended / full — trading wage cost against dwell time, late departures, and breakdown risk). Individual crew members, captains, and traits build on top of that once the coarse system proves fun.

⸻

Captain System

Captains possess unique skills and personalities.

Possible statistics:

* Leadership
* Navigation
* Customer Service
* Mechanical Awareness
* Safety
* Stress Resistance

Example traits:

* People Person
* Old Salt
* Strict
* Mentor
* Calm Under Pressure

Captains influence both crew morale and operational performance.

⸻

Crew Happiness

Crew happiness is influenced by:

* Pay
* Benefits
* Captain leadership
* Staffing levels
* Fatigue

These factors combine into a Performance Score.

Performance affects:

* Delays
* Customer interactions
* Safety
* Mechanical wear
* Operational efficiency

Possible operational events:

* Minor delays
* Crew call-outs
* Mechanical mistakes
* Safety incidents
* Strikes
* Exceptional customer service

⸻

Compensation

Players control compensation separately for each role.

Examples:

Deckhands

Engineers

Officers

Captains

Higher wages improve morale, retention, and hiring quality.

Benefits are selected from simple tiers:

* Minimal
* Standard
* Excellent

Better benefits improve long-term happiness and performance.

⸻

Revenue

Primary revenue sources:

* Passenger tickets
* Vehicle tickets
* Commercial freight

Larger vehicles consume more deck space but generate higher ticket revenue.

Commercial freight is distinct from private cars: a truck occupies several car slots on deck, pays its own (higher) fare, and does not count normal passenger occupancy. This makes "freight route vs. car route" a real capacity decision rather than a reskin.

Different routes naturally emphasize different traffic types.

⸻

Contracts & Service Obligations

The county and local institutions offer service contracts: guaranteed recurring income in exchange for a service-level obligation.

Examples:

* Mail contract — sail to a given island before 07:30 every weekday
* School run — a guaranteed morning and afternoon sailing
* Hospital standby — keep a vessel available at a given port
* Freight agreement — minimum weekly freight capacity on a route

Contracts pay a steady stipend and charge penalties (money and reputation) when missed. They serve three purposes:

* A stable-income counterweight to volatile fare revenue
* Constraint-based scheduling puzzles (the obligation must coexist with the profitable timetable)
* Narrative flavor grounded in the region

⸻

Loans & Vessel Resale

Financing deepens the economy and softens the bankruptcy cliff into a decision:

* Loans — borrow against company value; interest accrues daily. Leverage accelerates expansion but raises the stakes of a bad season.
* Vessel resale — owned hulls can be sold at a fraction of purchase price (falling with age/condition). Resale is what makes seasonal fleet-sizing a real choice instead of a ratchet.

⸻

Ticket Pricing

Players manually set ticket prices.

Future research may reveal:

* Optimal pricing
* Customer willingness to pay
* Demand forecasts
* Market segments

⸻

Operating Expenses

Expenses include:

* Fuel
* Wages
* Benefits
* Maintenance
* Repairs
* Terminal upgrades
* Research
* Vessel purchases

Cost structure principle: owning a hull costs only modest daily moorage/insurance — the dominant costs follow activity (crewed sailings, fuel, and later wear). A vessel sitting at the dock, or thinned to a few runs a day to match off-season demand, is cheap to keep. This makes seasonal strategy a spectrum (full schedule → thinned schedule → idle hull → sell) rather than a binary keep/sell.

⸻

Fuel

Fuel usage depends on:

* Route distance
* Sailing frequency
* Vessel efficiency

Distance × Sailings × Fuel Consumption = Fuel Cost

⸻

Maintenance

Maintenance condition ranges from:

* Excellent
* Good
* Fair
* Poor
* Critical

Ignoring maintenance saves money in the short term but increases breakdown risk.

Wear accrues with distance sailed. Crucially, scheduled maintenance requires taking the vessel out of service — it must sit at the home port for a block of hours — so maintenance collides with the timetable. The decision is "which sailings do I sacrifice this week," never just "click repair." This keeps maintenance a planning problem rather than a chore.

⸻

Mechanical Breakdowns

Inspired by RollerCoaster Tycoon.

Breakdown probability depends on:

* Vessel age
* Maintenance condition
* Engineer skill
* Captain ability
* Random chance

Possible failures:

* Engine
* Hydraulics
* Electrical
* Loading ramp
* Navigation systems

Repairs require:

* Money
* Time
* Available engineers

The vessel may temporarily leave service.

⸻

Customer Satisfaction

Customer satisfaction is primarily an emergent system.

Positive influences:

* Reliable schedules
* Friendly crews
* Safe operation
* Comfortable terminals
* Short wait times

Negative influences:

* Delays
* Overcrowding
* Breakdowns
* Long queues
* Poor customer service
* Strikes

⸻

Terminal Upgrades

Optional investments include:

* Coffee shop
* Restaurant
* Gift shop
* Covered waiting area
* Expanded parking
* Bike storage
* Tourist information

These improve customer satisfaction while generating supplemental revenue.

⸻

Research

Research unlocks new capabilities rather than simple stat bonuses.

Potential research topics:

* Market research
* Ticket pricing
* Fuel optimization
* Preventative maintenance
* Marketing
* Reservation systems
* Dynamic scheduling
* Fleet analytics
* New vessel technology

⸻

Goals & Milestones

The game needs a win-shaped direction, not only a fail state (insolvency).

Until a full campaign exists, soft milestones give sessions purpose:

* Reach a target company value
* Serve every island in the region
* Sustain a reputation threshold across the network
* Grow a community to a given size

Milestones are recognition, not gates — the sandbox stays open. A campaign mode (scenario objectives with starting conditions) builds on the same system later.

⸻

Scheduling Tools

Hand-placing every sailing does not scale past a few boats, and precision drag-and-drop is hostile on touch.

A schedule generator is planned — some form of "route + service window + frequency → generated timetable" that can be saved, edited, and re-generated. The exact interaction design is still being explored and is deliberately not locked yet; the manual timetable remains the foundation it builds on.

⸻

Platform & Session Design

The game is mobile-first. That decision shapes systems, not just UI.

Session unit: one in-game day is roughly 2–3 real minutes at 1× speed — a natural mobile session is "play a day or two," check the ledger, adjust, and leave. Weekly (growth tick, contracts) and seasonal (fleet re-planning) rhythms give longer arcs across many short sessions.

Mobile requirements:

* Persistence is table stakes — the game saves continuously and restores exactly, because mobile sessions are interrupted constantly
* Installable as a PWA
* UI architecture: bottom tab bar (Map · Schedule · Company), with port detail as a bottom sheet over the map; the map is the primary surface and the route list
* Touch targets meet a 44px minimum; safe-area insets respected
* No twitch inputs — every interaction works as tap-first

Onboarding/tutorial is deliberately deferred until the core mechanics are complete — no point maintaining a tutorial for systems still in flux.

⸻

Visual Direction

Long-term: low-poly 3D — a stylized, cozy PNW look (calm water, forested islands, readable vessels).

The current proof of concept exists to test whether the core mechanics are fun, so it stays 2D canvas — but with an art pass that carries the intended mood and proves the readability rules that 3D will inherit:

* Islands as irregular seeded-noise shapes with a beach ring, not geometric ellipses
* Time-of-day tint — dawn/dusk water gradients, boat lights at night, so the clock is felt
* Boat life — wake trails, a subtle bob while docked, arced crossings
* Zoom-dependent detail — labels and gauges appear only past a zoom threshold; zoomed out, ports reduce to clean dots (only the selected port keeps its label)
* Queue/demand readouts attached to the port marker, legible at small sizes

⸻

Development Roadmap

(The phases below are the vision-level arc. The prototype's concrete, current build order lives in DESIGN-NOTES.md and is allowed to interleave phases — e.g. mobile-viability work lands early so the deep sim is tested on the platform it's meant for.)

Phase 1 — Vertical Slice

* One map
* Two terminals
* One ferry
* Basic scheduling
* Revenue & expenses
* Demand simulation
* Win/loss conditions

⸻

Phase 2 — Fleet Operations

* Multiple routes
* Multiple vessels
* Fleet purchasing
* Fuel
* Maintenance
* Breakdowns
* Statistics

⸻

Phase 3 — Crew Management

* Hiring
* Wages
* Benefits
* Fatigue
* Captains
* Crew performance
* Operational events

⸻

Phase 4 — Research & Business

* Research tree
* Marketing
* Pricing studies
* Operational improvements
* Advanced scheduling

⸻

Phase 5 — Regional Growth

* Community development
* Tourism
* Industry
* Freight economy
* Terminal upgrades

⸻

Phase 6 — Polish

* Weather
* Seasons
* Random events
* Unique captains
* Campaign mode
* Sandbox mode
* Achievements
* Leaderboards

⸻

Vision Statement

The player begins with a single ferry serving two small communities.

Over time they develop a regional transportation network where every schedule, employee, vessel, and town influences the others.

Success isn’t measured by the number of ferries owned, but by creating a resilient, profitable transportation system that shapes the future of an entire island region.