Ferry Game

Game Design Document (v0.2)

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

Different routes naturally emphasize different traffic types.

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

Development Roadmap

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