#!/usr/bin/env node

/**
 * Comprehensive Diagnostic Test for Edge.Scraper.Pro
 * Tests the tool with the provided 500+ Pro Football Reference URLs
 */

const fs = require('fs');
const path = require('path');
const { PFRValidator } = require('./src/lib/pfr-validator');
const { SportsContentExtractor } = require('./src/lib/sports-extractor');
const { SportsDataExporter } = require('./src/lib/sports-export');
const { fetchWithPolicy, getMetrics, resetMetrics } = require('./src/lib/http/simple-enhanced-client');

// The provided URLs for testing
const TEST_URLS = [
    'https://www.pro-football-reference.com/players/T/TomlLa00.htm',
    'https://www.pro-football-reference.com/players/F/FaulMa00.htm',
    'https://www.pro-football-reference.com/players/H/HolmPr00.htm',
    'https://www.pro-football-reference.com/players/A/AlexSh00.htm',
    'https://www.pro-football-reference.com/players/D/DaviTe00.htm',
    'https://www.pro-football-reference.com/players/M/McCaCh01.htm',
    'https://www.pro-football-reference.com/players/S/SmitEm00.htm',
    'https://www.pro-football-reference.com/players/J/JohnCh04.htm',
    'https://www.pro-football-reference.com/players/G/GreeAh00.htm',
    'https://www.pro-football-reference.com/players/T/TaylJo02.htm',
    'https://www.pro-football-reference.com/players/J/JameEd00.htm',
    'https://www.pro-football-reference.com/players/J/JohnLa00.htm',
    'https://www.pro-football-reference.com/players/D/DickEr00.htm',
    'https://www.pro-football-reference.com/players/J/JohnDa08.htm',
    'https://www.pro-football-reference.com/players/F/FostAr00.htm',
    'https://www.pro-football-reference.com/players/J/JackSt00.htm',
    'https://www.pro-football-reference.com/players/B/BarkSa00.htm',
    'https://www.pro-football-reference.com/players/G/GurlTo01.htm',
    'https://www.pro-football-reference.com/players/H/HenrDe00.htm',
    'https://www.pro-football-reference.com/players/S/SandBa00.htm',
    'https://www.pro-football-reference.com/players/W/WillRi00.htm',
    'https://www.pro-football-reference.com/players/A/AlleMa00.htm',
    'https://www.pro-football-reference.com/players/G/GibbJa01.htm',
    'https://www.pro-football-reference.com/players/A/AndeJa00.htm',
    'https://www.pro-football-reference.com/players/C/CharJa00.htm',
    'https://www.pro-football-reference.com/players/P/PeteAd01.htm',
    'https://www.pro-football-reference.com/players/B/BarbTi00.htm',
    'https://www.pro-football-reference.com/players/L/LewiJa00.htm',
    'https://www.pro-football-reference.com/players/R/RiceRa00.htm',
    'https://www.pro-football-reference.com/players/W/WildJa00.htm',
    'https://www.pro-football-reference.com/players/K/KamaAl00.htm',
    'https://www.pro-football-reference.com/players/M/MurrDe00.htm',
    'https://www.pro-football-reference.com/players/C/CookDa01.htm',
    'https://www.pro-football-reference.com/players/E/ElliEz00.htm',
    'https://www.pro-football-reference.com/players/C/CraiRo00.htm',
    'https://www.pro-football-reference.com/players/B/BellLe00.htm',
    'https://www.pro-football-reference.com/players/W/WillDe02.htm',
    'https://www.pro-football-reference.com/players/G/GeorEd00.htm',
    'https://www.pro-football-reference.com/players/H/HillDa00.htm',
    'https://www.pro-football-reference.com/players/P/PortCl00.htm',
    'https://www.pro-football-reference.com/players/R/RobiBi01.htm',
    'https://www.pro-football-reference.com/players/M/McCoLe01.htm',
    'https://www.pro-football-reference.com/players/C/CampEa00.htm',
    'https://www.pro-football-reference.com/players/W/WestBr00.htm',
    'https://www.pro-football-reference.com/players/M/MartCu00.htm',
    'https://www.pro-football-reference.com/players/A/AndrWi00.htm',
    'https://www.pro-football-reference.com/players/T/ThomTh00.htm',
    'https://www.pro-football-reference.com/players/A/AlleTe00.htm',
    'https://www.pro-football-reference.com/players/R/RiggJo00.htm',
    'https://www.pro-football-reference.com/players/S/SimsBi00.htm',
    'https://www.pro-football-reference.com/players/J/JacoJo01.htm',
    'https://www.pro-football-reference.com/players/M/MorrJo00.htm',
    'https://www.pro-football-reference.com/players/P/PaytWa00.htm',
    'https://www.pro-football-reference.com/players/E/EkelAu00.htm',
    'https://www.pro-football-reference.com/players/T/TurnMi00.htm',
    'https://www.pro-football-reference.com/players/D/DrewMa00.htm',
    'https://www.pro-football-reference.com/players/J/JoneAa00.htm',
    'https://www.pro-football-reference.com/players/L/LyncMa00.htm',
    'https://www.pro-football-reference.com/players/M/McAlDe00.htm',
    'https://www.pro-football-reference.com/players/F/FortMa00.htm',
    'https://www.pro-football-reference.com/players/M/MartDo00.htm',
    'https://www.pro-football-reference.com/players/T/TaylFr00.htm',
    'https://www.pro-football-reference.com/players/G/GoreFr00.htm',
    'https://www.pro-football-reference.com/players/H/HearGa00.htm',
    'https://www.pro-football-reference.com/players/F/FostBa00.htm',
    'https://www.pro-football-reference.com/players/M/MuncCh00.htm',
    'https://www.pro-football-reference.com/players/R/RiggGe00.htm',
    'https://www.pro-football-reference.com/players/P/ParkWi00.htm',
    'https://www.pro-football-reference.com/players/G/GarnCh00.htm',
    'https://www.pro-football-reference.com/players/A/AndeNe00.htm',
    'https://www.pro-football-reference.com/players/D/DaviDo01.htm',
    'https://www.pro-football-reference.com/players/W/WarnCu00.htm',
    'https://www.pro-football-reference.com/players/C/ChubNi00.htm',
    'https://www.pro-football-reference.com/players/D/DaviSt00.htm',
    'https://www.pro-football-reference.com/players/W/WattRi00.htm',
    'https://www.pro-football-reference.com/players/L/LeveDo00.htm',
    'https://www.pro-football-reference.com/players/A/AndeMi00.htm',
    'https://www.pro-football-reference.com/players/W/WarrCh00.htm',
    'https://www.pro-football-reference.com/players/M/MontWi00.htm',
    'https://www.pro-football-reference.com/players/M/MixoJo00.htm',
    'https://www.pro-football-reference.com/players/D/DillCo00.htm',
    'https://www.pro-football-reference.com/players/R/RogeGe00.htm',
    'https://www.pro-football-reference.com/players/S/SmitRo00.htm',
    'https://www.pro-football-reference.com/players/F/FreeDe00.htm',
    'https://www.pro-football-reference.com/players/M/MostRa00.htm',
    'https://www.pro-football-reference.com/players/H/HuntKa00.htm',
    'https://www.pro-football-reference.com/players/T/TyleWe00.htm',
    'https://www.pro-football-reference.com/players/M/MorrAl00.htm',
    'https://www.pro-football-reference.com/players/H/HenrTr00.htm',
    'https://www.pro-football-reference.com/players/J/JoneTh00.htm',
    'https://www.pro-football-reference.com/players/W/WillKy02.htm',
    'https://www.pro-football-reference.com/players/W/WalkHe00.htm',
    'https://www.pro-football-reference.com/players/M/MoreKn00.htm',
    'https://www.pro-football-reference.com/players/A/AddaJo00.htm',
    'https://www.pro-football-reference.com/players/B/BellGr00.htm',
    'https://www.pro-football-reference.com/players/C/CookJa01.htm',
    'https://www.pro-football-reference.com/players/H/HillPe00.htm',
    'https://www.pro-football-reference.com/players/W/WhitLo00.htm',
    'https://www.pro-football-reference.com/players/J/JohnPe00.htm',
    'https://www.pro-football-reference.com/players/L/LacyEd00.htm',
    'https://www.pro-football-reference.com/players/G/GordMe00.htm',
    'https://www.pro-football-reference.com/players/B/BrooJa00.htm',
    'https://www.pro-football-reference.com/players/D/DorsTo00.htm',
    'https://www.pro-football-reference.com/players/J/JohnRu00.htm',
    'https://www.pro-football-reference.com/players/H/HarrNa00.htm',
    'https://www.pro-football-reference.com/players/B/BlouLe00.htm',
    'https://www.pro-football-reference.com/players/C/ConnJa00.htm',
    'https://www.pro-football-reference.com/players/J/JordLa00.htm',
    'https://www.pro-football-reference.com/players/E/EtieTr00.htm',
    'https://www.pro-football-reference.com/players/S/SmitLa00.htm',
    'https://www.pro-football-reference.com/players/M/MeanNa00.htm',
    'https://www.pro-football-reference.com/players/C/CribJo00.htm',
    'https://www.pro-football-reference.com/players/A/AchaDe00.htm',
    'https://www.pro-football-reference.com/players/S/SlatSt00.htm',
    'https://www.pro-football-reference.com/players/B/BettJe00.htm',
    'https://www.pro-football-reference.com/players/M/McFaDa00.htm',
    'https://www.pro-football-reference.com/players/I/IngrMa01.htm',
    'https://www.pro-football-reference.com/players/B/BrowTe00.htm',
    'https://www.pro-football-reference.com/players/H/HampRo00.htm',
    'https://www.pro-football-reference.com/players/A/AndeOt00.htm',
    'https://www.pro-football-reference.com/players/M/MendRa00.htm',
    'https://www.pro-football-reference.com/players/L/LoviDe00.htm',
    'https://www.pro-football-reference.com/players/E/EdwaRo00.htm',
    'https://www.pro-football-reference.com/players/H/HallBr03.htm',
    'https://www.pro-football-reference.com/players/W/WillJa06.htm',
    'https://www.pro-football-reference.com/players/B/BennEd00.htm',
    'https://www.pro-football-reference.com/players/O/OkoyCh00.htm',
    'https://www.pro-football-reference.com/players/S/StewJa00.htm',
    'https://www.pro-football-reference.com/players/S/SpilC.00.htm',
    'https://www.pro-football-reference.com/players/M/MontDa01.htm',
    'https://www.pro-football-reference.com/players/P/PollTo00.htm',
    'https://www.pro-football-reference.com/players/K/KaufNa00.htm',
    'https://www.pro-football-reference.com/players/G/GranRy00.htm',
    'https://www.pro-football-reference.com/players/W/WoodIc00.htm',
    'https://www.pro-football-reference.com/players/D/DunnWa00.htm',
    'https://www.pro-football-reference.com/players/W/WhitCh00.htm',
    'https://www.pro-football-reference.com/players/A/AbduKa00.htm',
    'https://www.pro-football-reference.com/players/S/StalDu00.htm',
    'https://www.pro-football-reference.com/players/M/MitcSt00.htm',
    'https://www.pro-football-reference.com/players/S/SmitAn00.htm',
    'https://www.pro-football-reference.com/players/S/SettJo00.htm',
    'https://www.pro-football-reference.com/players/W/WhitRa01.htm',
    'https://www.pro-football-reference.com/players/M/McGaWi00.htm',
    'https://www.pro-football-reference.com/players/R/RichTr00.htm',
    'https://www.pro-football-reference.com/players/F/ForsJu00.htm',
    'https://www.pro-football-reference.com/players/P/PruiMi00.htm',
    'https://www.pro-football-reference.com/players/R/RobiJa00.htm',
    'https://www.pro-football-reference.com/players/W/WillHa00.htm',
    'https://www.pro-football-reference.com/players/J/JameCr00.htm',
    'https://www.pro-football-reference.com/players/B/ByneEa00.htm',
    'https://www.pro-football-reference.com/players/H/HowaJo00.htm',
    'https://www.pro-football-reference.com/players/B/BrowCh10.htm',
    'https://www.pro-football-reference.com/players/J/JacoBr00.htm',
    'https://www.pro-football-reference.com/players/R/RidlSt00.htm',
    'https://www.pro-football-reference.com/players/H/HubbCh01.htm',
    'https://www.pro-football-reference.com/players/B/BarbMa01.htm',
    'https://www.pro-football-reference.com/players/I/IrviBu00.htm',
    'https://www.pro-football-reference.com/players/M/McNeFr00.htm',
    'https://www.pro-football-reference.com/players/S/SandMi01.htm',
    'https://www.pro-football-reference.com/players/M/MackKe00.htm',
    'https://www.pro-football-reference.com/players/R/RhetEr00.htm',
    'https://www.pro-football-reference.com/players/C/CarsCh00.htm',
    'https://www.pro-football-reference.com/players/H/HampLo00.htm',
    'https://www.pro-football-reference.com/players/W/WillJo00.htm',
    'https://www.pro-football-reference.com/players/B/BennMi00.htm',
    'https://www.pro-football-reference.com/players/F/FourLe00.htm',
    'https://www.pro-football-reference.com/players/D/DickCu00.htm',
    'https://www.pro-football-reference.com/players/J/JameLi00.htm',
    'https://www.pro-football-reference.com/players/B/BradAh00.htm',
    'https://www.pro-football-reference.com/players/G/GaryCl00.htm',
    'https://www.pro-football-reference.com/players/H/HarrDa06.htm',
    'https://www.pro-football-reference.com/players/H/HeywCr00.htm',
    'https://www.pro-football-reference.com/players/S/SproDa00.htm',
    'https://www.pro-football-reference.com/players/J/JackEa00.htm',
    'https://www.pro-football-reference.com/players/D/DrouRe00.htm',
    'https://www.pro-football-reference.com/players/W/WhitJa02.htm',
    'https://www.pro-football-reference.com/players/S/StewJo00.htm',
    'https://www.pro-football-reference.com/players/M/MayeRu00.htm',
    'https://www.pro-football-reference.com/players/A/AjayJa00.htm',
    'https://www.pro-football-reference.com/players/L/LindPh00.htm',
    'https://www.pro-football-reference.com/players/J/JackFr02.htm',
    'https://www.pro-football-reference.com/players/D/DelpRo00.htm',
    'https://www.pro-football-reference.com/players/G/GreeBe00.htm',
    'https://www.pro-football-reference.com/players/F/FennDe00.htm',
    'https://www.pro-football-reference.com/players/G/GibsAn00.htm',
    'https://www.pro-football-reference.com/players/M/MathRy00.htm',
    'https://www.pro-football-reference.com/players/B/BushMi00.htm',
    'https://www.pro-football-reference.com/players/M/MillLa01.htm',
    'https://www.pro-football-reference.com/players/B/BushRe00.htm',
    'https://www.pro-football-reference.com/players/W/WillMo00.htm',
    'https://www.pro-football-reference.com/players/A/AndeGa00.htm',
    'https://www.pro-football-reference.com/players/B/BettLa00.htm',
    'https://www.pro-football-reference.com/players/H/HillJe01.htm',
    'https://www.pro-football-reference.com/players/C/CobbRe00.htm',
    'https://www.pro-football-reference.com/players/W/WashJo00.htm',
    'https://www.pro-football-reference.com/players/P/PattCo00.htm',
    'https://www.pro-football-reference.com/players/B/ButtMa00.htm',
    'https://www.pro-football-reference.com/players/R/RhodDo00.htm',
    'https://www.pro-football-reference.com/players/B/BrowRo05.htm',
    'https://www.pro-football-reference.com/players/C/CollTo01.htm',
    'https://www.pro-football-reference.com/players/T/TaylCh01.htm',
    'https://www.pro-football-reference.com/players/G/GrahEa00.htm',
    'https://www.pro-football-reference.com/players/S/StevRh00.htm',
    'https://www.pro-football-reference.com/players/T/ThomAn01.htm',
    'https://www.pro-football-reference.com/players/P/PittMi00.htm',
    'https://www.pro-football-reference.com/players/H/HumpBo00.htm',
    'https://www.pro-football-reference.com/players/W/WindSa00.htm',
    'https://www.pro-football-reference.com/players/N/NelsDa00.htm',
    'https://www.pro-football-reference.com/players/H/HoarLe00.htm',
    'https://www.pro-football-reference.com/players/A/AndeC.00.htm',
    'https://www.pro-football-reference.com/players/B/ByarKe00.htm',
    'https://www.pro-football-reference.com/players/W/WalkKe00.htm',
    'https://www.pro-football-reference.com/players/M/MurrLa00.htm',
    'https://www.pro-football-reference.com/players/M/MurrAd00.htm',
    'https://www.pro-football-reference.com/players/E/EdwaGu00.htm',
    'https://www.pro-football-reference.com/players/H/HarrRa00.htm',
    'https://www.pro-football-reference.com/players/H/HydeCa00.htm',
    'https://www.pro-football-reference.com/players/C/CoopEa00.htm',
    'https://www.pro-football-reference.com/players/P/ParmBe00.htm',
    'https://www.pro-football-reference.com/players/W/WheaTy00.htm',
    'https://www.pro-football-reference.com/players/E/ElliGe00.htm',
    'https://www.pro-football-reference.com/players/I/IvorCh00.htm',
    'https://www.pro-football-reference.com/players/S/SwifDA00.htm',
    'https://www.pro-football-reference.com/players/B/BensCe00.htm',
    'https://www.pro-football-reference.com/players/S/SmitKe02.htm',
    'https://www.pro-football-reference.com/players/G/GaryOl00.htm',
    'https://www.pro-football-reference.com/players/H/HarrFr00.htm',
    'https://www.pro-football-reference.com/players/J/JoneJa00.htm',
    'https://www.pro-football-reference.com/players/R/RussLe00.htm',
    'https://www.pro-football-reference.com/players/A/AberWa00.htm',
    'https://www.pro-football-reference.com/players/C/CentLa00.htm',
    'https://www.pro-football-reference.com/players/L/LewiDi00.htm',
    'https://www.pro-football-reference.com/players/F/FerrEa00.htm',
    'https://www.pro-football-reference.com/players/S/ShipMa00.htm',
    'https://www.pro-football-reference.com/players/P/PachIs00.htm',
    'https://www.pro-football-reference.com/players/N/NathTo00.htm',
    'https://www.pro-football-reference.com/players/R/RoziMi00.htm',
    'https://www.pro-football-reference.com/players/M/McClLe00.htm',
    'https://www.pro-football-reference.com/players/B/BrowGa00.htm',
    'https://www.pro-football-reference.com/players/G/GreeSh00.htm',
    'https://www.pro-football-reference.com/players/M/MackMa00.htm',
    'https://www.pro-football-reference.com/players/D/DrakKe00.htm',
    'https://www.pro-football-reference.com/players/F/FordJe00.htm',
    'https://www.pro-football-reference.com/players/B/BarlKe00.htm',
    'https://www.pro-football-reference.com/players/B/BernGi00.htm',
    'https://www.pro-football-reference.com/players/W/WhitLe01.htm',
    'https://www.pro-football-reference.com/players/W/WellCh00.htm',
    'https://www.pro-football-reference.com/players/H/HogeMe00.htm',
    'https://www.pro-football-reference.com/players/S/SpriRo00.htm',
    'https://www.pro-football-reference.com/players/J/JoneKe02.htm',
    'https://www.pro-football-reference.com/players/J/JohnAn00.htm',
    'https://www.pro-football-reference.com/players/J/JohnJo00.htm',
    'https://www.pro-football-reference.com/players/C/CrowIs00.htm',
    'https://www.pro-football-reference.com/players/B/BellJo01.htm',
    'https://www.pro-football-reference.com/players/M/MetcEr00.htm',
    'https://www.pro-football-reference.com/players/W/WoodDa02.htm',
    'https://www.pro-football-reference.com/players/C/CoheTa00.htm',
    'https://www.pro-football-reference.com/players/M/MackSt00.htm',
    'https://www.pro-football-reference.com/players/R/RobiBr01.htm',
    'https://www.pro-football-reference.com/players/W/WillJa10.htm',
    'https://www.pro-football-reference.com/players/C/CainLy00.htm',
    'https://www.pro-football-reference.com/players/C/ColeTe01.htm',
    'https://www.pro-football-reference.com/players/G/GoinNi00.htm',
    'https://www.pro-football-reference.com/players/T/ThomPi00.htm',
    'https://www.pro-football-reference.com/players/A/AlstMi00.htm',
    'https://www.pro-football-reference.com/players/W/WareSp00.htm',
    'https://www.pro-football-reference.com/players/P/PegrEr00.htm',
    'https://www.pro-football-reference.com/players/D/DobbJK00.htm',
    'https://www.pro-football-reference.com/players/S/SalaRa00.htm',
    'https://www.pro-football-reference.com/players/B/BentAl00.htm',
    'https://www.pro-football-reference.com/players/D/DowdRi01.htm',
    'https://www.pro-football-reference.com/players/J/JoneRo01.htm',
    'https://www.pro-football-reference.com/players/W/WillCa02.htm',
    'https://www.pro-football-reference.com/players/S/SingDe00.htm',
    'https://www.pro-football-reference.com/players/K/KirbTe00.htm',
    'https://www.pro-football-reference.com/players/S/StacZa00.htm',
    'https://www.pro-football-reference.com/players/T/TolbMi00.htm',
    'https://www.pro-football-reference.com/players/W/WilsWa02.htm',
    'https://www.pro-football-reference.com/players/M/MoorRo01.htm',
    'https://www.pro-football-reference.com/players/B/BryaCu00.htm',
    'https://www.pro-football-reference.com/players/B/BrowCh03.htm',
    'https://www.pro-football-reference.com/players/S/StepJo00.htm',
    'https://www.pro-football-reference.com/players/W/WardDe01.htm',
    'https://www.pro-football-reference.com/players/P/PinkAl00.htm',
    'https://www.pro-football-reference.com/players/I/IverEd00.htm',
    'https://www.pro-football-reference.com/players/T/TillLe00.htm',
    'https://www.pro-football-reference.com/players/P/PeacEl00.htm',
    'https://www.pro-football-reference.com/players/W/WatsKe00.htm',
    'https://www.pro-football-reference.com/players/D/DillAJ00.htm',
    'https://www.pro-football-reference.com/players/A/AlleJa00.htm',
    'https://www.pro-football-reference.com/players/A/AsiaMa00.htm',
    'https://www.pro-football-reference.com/players/G/GreeHa00.htm',
    'https://www.pro-football-reference.com/players/D/DuckT.00.htm',
    'https://www.pro-football-reference.com/players/L/LeshMi00.htm',
    'https://www.pro-football-reference.com/players/W/WillDa10.htm',
    'https://www.pro-football-reference.com/players/B/BateMa00.htm',
    'https://www.pro-football-reference.com/players/B/BellTa00.htm',
    'https://www.pro-football-reference.com/players/R/RichTo00.htm',
    'https://www.pro-football-reference.com/players/R/RiddRo00.htm',
    'https://www.pro-football-reference.com/players/C/CollAl00.htm',
    'https://www.pro-football-reference.com/players/E/EnisCu00.htm',
    'https://www.pro-football-reference.com/players/D/DaviMi01.htm',
    'https://www.pro-football-reference.com/players/J/JoneJu01.htm',
    'https://www.pro-football-reference.com/players/C/CarpRo01.htm',
    'https://www.pro-football-reference.com/players/B/BrowTh00.htm',
    'https://www.pro-football-reference.com/players/H/HarrJe00.htm',
    'https://www.pro-football-reference.com/players/K/KinnLa00.htm',
    'https://www.pro-football-reference.com/players/M/MitcEl00.htm',
    'https://www.pro-football-reference.com/players/H/HarmCl00.htm',
    'https://www.pro-football-reference.com/players/D/DelaJo00.htm',
    'https://www.pro-football-reference.com/players/W/WoolBu00.htm',
    'https://www.pro-football-reference.com/players/T/ThomRo00.htm',
    'https://www.pro-football-reference.com/players/C/CharZa00.htm',
    'https://www.pro-football-reference.com/players/M/MustBr00.htm',
    'https://www.pro-football-reference.com/players/T/TracTy00.htm',
    'https://www.pro-football-reference.com/players/S/StraTr00.htm',
    'https://www.pro-football-reference.com/players/C/CalhDo00.htm',
    'https://www.pro-football-reference.com/players/A/AllgTy00.htm',
    'https://www.pro-football-reference.com/players/S/SuheMa00.htm',
    'https://www.pro-football-reference.com/players/H/HiggMa00.htm',
    'https://www.pro-football-reference.com/players/H/HighTi00.htm',
    'https://www.pro-football-reference.com/players/M/MossZa00.htm',
    'https://www.pro-football-reference.com/players/S/SmitSa00.htm',
    'https://www.pro-football-reference.com/players/J/JohnDu00.htm',
    'https://www.pro-football-reference.com/players/M/MorrBa00.htm',
    'https://www.pro-football-reference.com/players/F/FargJu00.htm',
    'https://www.pro-football-reference.com/players/F/FostDe00.htm',
    'https://www.pro-football-reference.com/players/M/MichSo00.htm',
    'https://www.pro-football-reference.com/players/B/BernRo00.htm',
    'https://www.pro-football-reference.com/players/M/McKiJe00.htm',
    'https://www.pro-football-reference.com/players/P/PollFr00.htm',
    'https://www.pro-football-reference.com/players/E/EdwaCl00.htm',
    'https://www.pro-football-reference.com/players/M/McMiRa00.htm',
    'https://www.pro-football-reference.com/players/B/BaxtBr00.htm',
    'https://www.pro-football-reference.com/players/P/PoweBi00.htm',
    'https://www.pro-football-reference.com/players/B/BrooRe00.htm',
    'https://www.pro-football-reference.com/players/W/WillGe00.htm',
    'https://www.pro-football-reference.com/players/J/JennRa00.htm',
    'https://www.pro-football-reference.com/players/B/BestJa00.htm',
    'https://www.pro-football-reference.com/players/G/GajaHo00.htm',
    'https://www.pro-football-reference.com/players/H/HillRo00.htm',
    'https://www.pro-football-reference.com/players/W/WestTe00.htm',
    'https://www.pro-football-reference.com/players/H/HectJo00.htm',
    'https://www.pro-football-reference.com/players/M/MoriLa00.htm',
    'https://www.pro-football-reference.com/players/V/VanEMa00.htm',
    'https://www.pro-football-reference.com/players/W/WilsJe01.htm',
    'https://www.pro-football-reference.com/players/P/PierDa01.htm',
    'https://www.pro-football-reference.com/players/B/BreiMa00.htm',
    'https://www.pro-football-reference.com/players/W/WarrJa01.htm',
    'https://www.pro-football-reference.com/players/P/PalmPa00.htm',
    'https://www.pro-football-reference.com/players/F/FaulKe00.htm',
    'https://www.pro-football-reference.com/players/J/JoneFe00.htm',
    'https://www.pro-football-reference.com/players/H/HarmRo00.htm',
    'https://www.pro-football-reference.com/players/H/HendDa00.htm',
    'https://www.pro-football-reference.com/players/M/MaroLa00.htm',
    'https://www.pro-football-reference.com/players/S/SmitMa00.htm',
    'https://www.pro-football-reference.com/players/B/BlayDe00.htm',
    'https://www.pro-football-reference.com/players/J/JameGa00.htm',
    'https://www.pro-football-reference.com/players/W/WashLe00.htm',
    'https://www.pro-football-reference.com/players/G/GreeWi01.htm',
    'https://www.pro-football-reference.com/players/B/BellMi00.htm',
    'https://www.pro-football-reference.com/players/E/ElliAn00.htm',
    'https://www.pro-football-reference.com/players/G/GreeGa00.htm',
    'https://www.pro-football-reference.com/players/H/HambTr00.htm',
    'https://www.pro-football-reference.com/players/B/BarbPe01.htm',
    'https://www.pro-football-reference.com/players/Z/ZereAm00.htm',
    'https://www.pro-football-reference.com/players/H/HineNy00.htm',
    'https://www.pro-football-reference.com/players/W/WayxCh00.htm',
    'https://www.pro-football-reference.com/players/W/WonsGe00.htm',
    'https://www.pro-football-reference.com/players/S/SimsCh00.htm',
    'https://www.pro-football-reference.com/players/M/MorrSa00.htm',
    'https://www.pro-football-reference.com/players/P/PresDa00.htm',
    'https://www.pro-football-reference.com/players/J/JackBr00.htm',
    'https://www.pro-football-reference.com/players/A/AkerCa00.htm',
    'https://www.pro-football-reference.com/players/B/BryaKe00.htm',
    'https://www.pro-football-reference.com/players/F/FullBr00.htm',
    'https://www.pro-football-reference.com/players/W/WillAn00.htm',
    'https://www.pro-football-reference.com/players/M/MoorMe00.htm',
    'https://www.pro-football-reference.com/players/C/ClarJe00.htm',
    'https://www.pro-football-reference.com/players/F/ForeDO00.htm',
    'https://www.pro-football-reference.com/players/H/HuntRi00.htm',
    'https://www.pro-football-reference.com/players/L/LangJe00.htm',
    'https://www.pro-football-reference.com/players/J/JackBo00.htm',
    'https://www.pro-football-reference.com/players/B/BiakTi00.htm',
    'https://www.pro-football-reference.com/players/G/GaskMy00.htm',
    'https://www.pro-football-reference.com/players/D/DaynRo00.htm',
    'https://www.pro-football-reference.com/players/B/BussDe00.htm',
    'https://www.pro-football-reference.com/players/L/LintJo00.htm',
    'https://www.pro-football-reference.com/players/W/WordBa00.htm',
    'https://www.pro-football-reference.com/players/W/WorkVi00.htm',
    'https://www.pro-football-reference.com/players/S/StarJa00.htm',
    'https://www.pro-football-reference.com/players/B/BrowDo00.htm',
    'https://www.pro-football-reference.com/players/W/WhitJa00.htm',
    'https://www.pro-football-reference.com/players/B/BigsTa00.htm',
    'https://www.pro-football-reference.com/players/T/TateBe00.htm',
    'https://www.pro-football-reference.com/players/T/ToraRy00.htm',
    'https://www.pro-football-reference.com/players/K/KellRo00.htm',
    'https://www.pro-football-reference.com/players/D/DaveRo00.htm',
    'https://www.pro-football-reference.com/players/S/SpenTi00.htm',
    'https://www.pro-football-reference.com/players/A/AlleJa01.htm',
    'https://www.pro-football-reference.com/players/Y/YeldT.00.htm',
    'https://www.pro-football-reference.com/players/L/LaneFr00.htm',
    'https://www.pro-football-reference.com/players/M/MasoTr00.htm',
    'https://www.pro-football-reference.com/players/D/DarkOr00.htm',
    'https://www.pro-football-reference.com/players/N/NorwJe00.htm',
    'https://www.pro-football-reference.com/players/R/RawlTh00.htm',
    'https://www.pro-football-reference.com/players/C/CartMi03.htm',
    'https://www.pro-football-reference.com/players/T/TateLa00.htm',
    'https://www.pro-football-reference.com/players/T/ThomBl00.htm',
    'https://www.pro-football-reference.com/players/S/SmitOn00.htm',
    'https://www.pro-football-reference.com/players/T/ThomLe00.htm',
    'https://www.pro-football-reference.com/players/B/BuckCo00.htm',
    'https://www.pro-football-reference.com/players/H/HearHe00.htm',
    'https://www.pro-football-reference.com/players/G/GillMi00.htm',
    'https://www.pro-football-reference.com/players/F/FranAn00.htm',
    'https://www.pro-football-reference.com/players/E/ErviRi00.htm',
    'https://www.pro-football-reference.com/players/P/PrenTr00.htm',
    'https://www.pro-football-reference.com/players/F/FennRi00.htm',
    'https://www.pro-football-reference.com/players/H/HeluRo00.htm',
    'https://www.pro-football-reference.com/players/P/PennRa00.htm',
    'https://www.pro-football-reference.com/players/G/GallWa00.htm',
    'https://www.pro-football-reference.com/players/P/PhilLa00.htm',
    'https://www.pro-football-reference.com/players/J/JodaJi00.htm',
    'https://www.pro-football-reference.com/players/S/SnelJa00.htm',
    'https://www.pro-football-reference.com/players/E/EdmoCh00.htm',
    'https://www.pro-football-reference.com/players/M/MichCh00.htm',
    'https://www.pro-football-reference.com/players/B/BallVi00.htm',
    'https://www.pro-football-reference.com/players/M/McKnTe00.htm',
    'https://www.pro-football-reference.com/players/G/GalbTo00.htm',
    'https://www.pro-football-reference.com/players/V/VereSh00.htm',
    'https://www.pro-football-reference.com/players/H/HawkFr00.htm',
    'https://www.pro-football-reference.com/players/W/WillKa01.htm',
    'https://www.pro-football-reference.com/players/S/SherHe00.htm',
    'https://www.pro-football-reference.com/players/Y/YounRi00.htm',
    'https://www.pro-football-reference.com/players/B/BennDo00.htm',
    'https://www.pro-football-reference.com/players/W/WestCh01.htm',
    'https://www.pro-football-reference.com/players/J/JackWi01.htm',
    'https://www.pro-football-reference.com/players/M/MoorJe01.htm',
    'https://www.pro-football-reference.com/players/T/ThomCh03.htm',
    'https://www.pro-football-reference.com/players/T/ToneAn00.htm',
    'https://www.pro-football-reference.com/players/M/MorrMa00.htm',
    'https://www.pro-football-reference.com/players/B/BookDe00.htm',
    'https://www.pro-football-reference.com/players/M/McKiJ.00.htm',
    'https://www.pro-football-reference.com/players/P/PeteAd00.htm',
    'https://www.pro-football-reference.com/players/W/WillDa05.htm',
    'https://www.pro-football-reference.com/players/L/LeexAm00.htm',
    'https://www.pro-football-reference.com/players/B/BrysSh00.htm',
    'https://www.pro-football-reference.com/players/D/DaveNa00.htm',
    'https://www.pro-football-reference.com/players/A/AndeRi00.htm',
    'https://www.pro-football-reference.com/players/B/BrowDe01.htm',
    'https://www.pro-football-reference.com/players/D/DierSc00.htm',
    'https://www.pro-football-reference.com/players/O/OlivBr01.htm',
    'https://www.pro-football-reference.com/players/W/WorlTi00.htm',
    'https://www.pro-football-reference.com/players/B/BennWo00.htm',
    'https://www.pro-football-reference.com/players/E/EckwJe00.htm',
    'https://www.pro-football-reference.com/players/H/HerbKh00.htm',
    'https://www.pro-football-reference.com/players/R/RiddTh00.htm',
    'https://www.pro-football-reference.com/players/K/KingKe00.htm',
    'https://www.pro-football-reference.com/players/P/ParrRi00.htm',
    'https://www.pro-football-reference.com/players/H/HarpBr00.htm',
    'https://www.pro-football-reference.com/players/F/FergVa00.htm',
    'https://www.pro-football-reference.com/players/J/JackBi00.htm',
    'https://www.pro-football-reference.com/players/J/JohnKe06.htm',
    'https://www.pro-football-reference.com/players/A/AndeAl00.htm',
    'https://www.pro-football-reference.com/players/H/HolmDa00.htm',
    'https://www.pro-football-reference.com/players/R/RathTo00.htm',
    'https://www.pro-football-reference.com/players/F/FletTe00.htm',
    'https://www.pro-football-reference.com/players/G/GadoSa00.htm',
    'https://www.pro-football-reference.com/players/A/AdamGe00.htm',
    'https://www.pro-football-reference.com/players/V/VickRo00.htm',
    'https://www.pro-football-reference.com/players/H/HuckHa00.htm',
    'https://www.pro-football-reference.com/players/C/CulvRo00.htm',
    'https://www.pro-football-reference.com/players/D/DaviKn00.htm',
    'https://www.pro-football-reference.com/players/C/CravAa00.htm',
    'https://www.pro-football-reference.com/players/D/DaviKe00.htm',
    'https://www.pro-football-reference.com/players/S/SuggLe00.htm',
    'https://www.pro-football-reference.com/players/B/BellRi01.htm',
    'https://www.pro-football-reference.com/players/P/PeriSa00.htm',
    'https://www.pro-football-reference.com/players/M/MasoJo00.htm',
    'https://www.pro-football-reference.com/players/T/TaylBi00.htm',
    'https://www.pro-football-reference.com/players/H/HighAl00.htm',
    'https://www.pro-football-reference.com/players/M/MattAl01.htm',
    'https://www.pro-football-reference.com/players/L/LogaMa00.htm',
    'https://www.pro-football-reference.com/players/J/JensJi01.htm',
    'https://www.pro-football-reference.com/players/S/SpeaTy00.htm',
    'https://www.pro-football-reference.com/players/P/PattRi00.htm',
    'https://www.pro-football-reference.com/players/V/VardTo00.htm',
    'https://www.pro-football-reference.com/players/F/FeneGi00.htm',
    'https://www.pro-football-reference.com/players/C/CartKi00.htm',
    'https://www.pro-football-reference.com/players/J/JensJi00.htm',
    'https://www.pro-football-reference.com/players/Y/YounSe00.htm',
    'https://www.pro-football-reference.com/players/B/BurkRe00.htm',
    'https://www.pro-football-reference.com/players/M/MeggDa00.htm',
    'https://www.pro-football-reference.com/players/J/JennSt00.htm',
    'https://www.pro-football-reference.com/players/A/AbduAm00.htm',
    'https://www.pro-football-reference.com/players/A/AlexCh00.htm',
    'https://www.pro-football-reference.com/players/F/FreeRo00.htm',
    'https://www.pro-football-reference.com/players/D/DaviRa04.htm',
    'https://www.pro-football-reference.com/players/S/SmitSt00.htm',
    'https://www.pro-football-reference.com/players/M/MorrWa00.htm',
    'https://www.pro-football-reference.com/players/H/HillGr00.htm'
];

class DiagnosticTestSuite {
    constructor() {
        this.validator = new PFRValidator();
        this.extractor = new SportsContentExtractor();
        this.exporter = new SportsDataExporter();
        this.results = {
            urlValidation: null,
            httpClientTest: null,
            scrapingTest: null,
            extractionTest: null,
            exportTest: null,
            performanceTest: null,
            errorHandlingTest: null,
            overallGrade: null,
            recommendations: []
        };
    }

    async runCompleteDiagnostic() {
        console.log('🔬 EDGE.SCRAPER.PRO COMPREHENSIVE DIAGNOSTIC TEST');
        console.log('=' .repeat(60));
        console.log(`Testing with ${TEST_URLS.length} Pro Football Reference URLs\n`);

        const startTime = Date.now();

        try {
            // Test 1: URL Validation
            await this.testURLValidation();
            
            // Test 2: HTTP Client Functionality
            await this.testHTTPClient();
            
            // Test 3: Sample Scraping Test
            await this.testScraping();
            
            // Test 4: Content Extraction Test
            await this.testContentExtraction();
            
            // Test 5: Export Functionality Test
            await this.testExportFunctionality();
            
            // Test 6: Performance Analysis
            await this.testPerformance();
            
            // Test 7: Error Handling
            await this.testErrorHandling();
            
            // Generate final report
            this.generateFinalReport();
            
            const totalTime = Date.now() - startTime;
            console.log(`\n⏱️  Total diagnostic time: ${totalTime}ms`);
            
            // Save results
            this.saveResults();
            
            return this.results;
            
        } catch (error) {
            console.error('❌ Diagnostic test failed:', error);
            this.results.error = error.message;
            return this.results;
        }
    }

    async testURLValidation() {
        console.log('1️⃣  URL VALIDATION TEST');
        console.log('-'.repeat(40));
        
        const startTime = Date.now();
        const validationResult = this.validator.validateBatch(TEST_URLS);
        const endTime = Date.now();
        
        this.results.urlValidation = {
            totalUrls: validationResult.total,
            validUrls: validationResult.summary.validCount,
            invalidUrls: validationResult.summary.invalidCount,
            duplicateUrls: validationResult.summary.duplicateCount,
            validationTime: endTime - startTime,
            validationRate: (validationResult.summary.validCount / validationResult.total) * 100,
            details: validationResult
        };
        
        console.log(`📊 Results:`);
        console.log(`   Total URLs: ${validationResult.total}`);
        console.log(`   Valid: ${validationResult.summary.validCount} (${this.results.urlValidation.validationRate.toFixed(1)}%)`);
        console.log(`   Invalid: ${validationResult.summary.invalidCount}`);
        console.log(`   Duplicates: ${validationResult.summary.duplicateCount}`);
        console.log(`   Validation Time: ${this.results.urlValidation.validationTime}ms`);
        console.log(`   ✅ URL validation ${this.results.urlValidation.validationRate >= 95 ? 'PASSED' : 'NEEDS ATTENTION'}\n`);
    }

    async testHTTPClient() {
        console.log('2️⃣  HTTP CLIENT TEST');
        console.log('-'.repeat(40));
        
        resetMetrics();
        const testUrls = TEST_URLS.slice(0, 3); // Test with first 3 URLs
        const results = [];
        
        console.log(`Testing HTTP client with ${testUrls.length} URLs...`);
        
        for (const url of testUrls) {
            try {
                const startTime = Date.now();
                const response = await fetchWithPolicy(url, { timeout: 10000 });
                const endTime = Date.now();
                
                results.push({
                    url,
                    success: true,
                    status: response.status,
                    responseTime: endTime - startTime,
                    contentLength: response.headers.get('content-length') || 'unknown'
                });
                
                console.log(`   ✅ ${url.split('/').pop()}: ${response.status} (${endTime - startTime}ms)`);
                
            } catch (error) {
                results.push({
                    url,
                    success: false,
                    error: error.message,
                    errorType: error.constructor.name
                });
                
                console.log(`   ❌ ${url.split('/').pop()}: ${error.message}`);
            }
        }
        
        const metrics = getMetrics();
        const successRate = (results.filter(r => r.success).length / results.length) * 100;
        
        this.results.httpClientTest = {
            testUrls: testUrls.length,
            successfulRequests: results.filter(r => r.success).length,
            failedRequests: results.filter(r => !r.success).length,
            successRate,
            averageResponseTime: results.filter(r => r.success).reduce((sum, r) => sum + r.responseTime, 0) / results.filter(r => r.success).length || 0,
            metrics,
            details: results
        };
        
        console.log(`📊 HTTP Client Results:`);
        console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`   Average Response Time: ${this.results.httpClientTest.averageResponseTime.toFixed(0)}ms`);
        console.log(`   Rate Limit Hits: ${metrics.rateLimits.hits}`);
        console.log(`   Total Requests: ${metrics.requests.total}`);
        console.log(`   ✅ HTTP client ${successRate >= 80 ? 'PASSED' : 'NEEDS ATTENTION'}\n`);
    }

    async testScraping() {
        console.log('3️⃣  SCRAPING FUNCTIONALITY TEST');
        console.log('-'.repeat(40));
        
        // Use a smaller sample for actual scraping test
        const sampleUrls = TEST_URLS.slice(0, 5);
        const scrapingResults = [];
        
        console.log(`Testing scraping with ${sampleUrls.length} sample URLs...`);
        
        for (const url of sampleUrls) {
            try {
                const startTime = Date.now();
                const response = await fetchWithPolicy(url, { timeout: 15000 });
                
                if (response.ok) {
                    const html = await response.text();
                    const endTime = Date.now();
                    
                    scrapingResults.push({
                        url,
                        success: true,
                        status: response.status,
                        contentLength: html.length,
                        scrapingTime: endTime - startTime,
                        hasContent: html.length > 1000
                    });
                    
                    console.log(`   ✅ ${url.split('/').pop()}: ${html.length} chars (${endTime - startTime}ms)`);
                } else {
                    scrapingResults.push({
                        url,
                        success: false,
                        status: response.status,
                        error: `HTTP ${response.status}`
                    });
                    
                    console.log(`   ❌ ${url.split('/').pop()}: HTTP ${response.status}`);
                }
                
            } catch (error) {
                scrapingResults.push({
                    url,
                    success: false,
                    error: error.message,
                    errorType: error.constructor.name
                });
                
                console.log(`   ❌ ${url.split('/').pop()}: ${error.message}`);
            }
        }
        
        const successRate = (scrapingResults.filter(r => r.success).length / scrapingResults.length) * 100;
        const avgScrapingTime = scrapingResults.filter(r => r.success).reduce((sum, r) => sum + r.scrapingTime, 0) / scrapingResults.filter(r => r.success).length || 0;
        
        this.results.scrapingTest = {
            sampleSize: sampleUrls.length,
            successfulScrapes: scrapingResults.filter(r => r.success).length,
            failedScrapes: scrapingResults.filter(r => !r.success).length,
            successRate,
            averageScrapingTime: avgScrapingTime,
            averageContentLength: scrapingResults.filter(r => r.success).reduce((sum, r) => sum + r.contentLength, 0) / scrapingResults.filter(r => r.success).length || 0,
            details: scrapingResults
        };
        
        console.log(`📊 Scraping Results:`);
        console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`   Average Scraping Time: ${avgScrapingTime.toFixed(0)}ms`);
        console.log(`   Average Content Length: ${this.results.scrapingTest.averageContentLength.toFixed(0)} chars`);
        console.log(`   ✅ Scraping ${successRate >= 70 ? 'PASSED' : 'NEEDS ATTENTION'}\n`);
    }

    async testContentExtraction() {
        console.log('4️⃣  CONTENT EXTRACTION TEST');
        console.log('-'.repeat(40));
        
        // Test content extraction with mock HTML since we can't easily parse live HTML
        const mockHTML = this.generateMockPlayerHTML();
        const jsdom = require('jsdom');
        const { JSDOM } = jsdom;
        
        const extractionResults = [];
        
        // Test extraction on mock data
        for (let i = 0; i < 3; i++) {
            try {
                const startTime = Date.now();
                const dom = new JSDOM(mockHTML);
                const doc = dom.window.document;
                
                const extractionResult = this.extractor.extractSportsContent(doc, TEST_URLS[0]);
                const endTime = Date.now();
                
                extractionResults.push({
                    success: true,
                    extractionTime: endTime - startTime,
                    contentLength: extractionResult.content.length,
                    structuredDataKeys: Object.keys(extractionResult.structuredData || {}).length,
                    sportsValidation: extractionResult.sportsValidation,
                    method: extractionResult.method,
                    score: extractionResult.score
                });
                
                console.log(`   ✅ Mock extraction ${i+1}: ${extractionResult.content.length} chars, score: ${extractionResult.score}`);
                
            } catch (error) {
                extractionResults.push({
                    success: false,
                    error: error.message
                });
                
                console.log(`   ❌ Mock extraction ${i+1}: ${error.message}`);
            }
        }
        
        const successRate = (extractionResults.filter(r => r.success).length / extractionResults.length) * 100;
        const avgExtractionTime = extractionResults.filter(r => r.success).reduce((sum, r) => sum + r.extractionTime, 0) / extractionResults.filter(r => r.success).length || 0;
        
        this.results.extractionTest = {
            testCount: extractionResults.length,
            successfulExtractions: extractionResults.filter(r => r.success).length,
            successRate,
            averageExtractionTime: avgExtractionTime,
            averageContentLength: extractionResults.filter(r => r.success).reduce((sum, r) => sum + r.contentLength, 0) / extractionResults.filter(r => r.success).length || 0,
            averageScore: extractionResults.filter(r => r.success).reduce((sum, r) => sum + r.score, 0) / extractionResults.filter(r => r.success).length || 0,
            details: extractionResults
        };
        
        console.log(`📊 Content Extraction Results:`);
        console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`   Average Extraction Time: ${avgExtractionTime.toFixed(1)}ms`);
        console.log(`   Average Content Length: ${this.results.extractionTest.averageContentLength.toFixed(0)} chars`);
        console.log(`   Average Score: ${this.results.extractionTest.averageScore.toFixed(1)}`);
        console.log(`   ✅ Content extraction ${successRate >= 80 ? 'PASSED' : 'NEEDS ATTENTION'}\n`);
    }

    async testExportFunctionality() {
        console.log('5️⃣  EXPORT FUNCTIONALITY TEST');
        console.log('-'.repeat(40));
        
        // Generate mock scraping results for export testing
        const mockResults = this.generateMockScrapingResults();
        const exportFormats = ['enhanced-csv', 'structured-json', 'player-database'];
        const exportResults = [];
        
        for (const format of exportFormats) {
            try {
                const startTime = Date.now();
                const exportedData = this.exporter.exportSportsData(mockResults, format);
                const endTime = Date.now();
                
                exportResults.push({
                    format,
                    success: true,
                    exportTime: endTime - startTime,
                    dataSize: exportedData.length,
                    isValid: this.validateExportFormat(exportedData, format)
                });
                
                console.log(`   ✅ ${format}: ${exportedData.length} chars (${endTime - startTime}ms)`);
                
            } catch (error) {
                exportResults.push({
                    format,
                    success: false,
                    error: error.message
                });
                
                console.log(`   ❌ ${format}: ${error.message}`);
            }
        }
        
        const successRate = (exportResults.filter(r => r.success).length / exportResults.length) * 100;
        
        this.results.exportTest = {
            formatsTestedCount: exportFormats.length,
            successfulExports: exportResults.filter(r => r.success).length,
            successRate,
            averageExportTime: exportResults.filter(r => r.success).reduce((sum, r) => sum + r.exportTime, 0) / exportResults.filter(r => r.success).length || 0,
            details: exportResults
        };
        
        console.log(`📊 Export Results:`);
        console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
        console.log(`   Average Export Time: ${this.results.exportTest.averageExportTime.toFixed(1)}ms`);
        console.log(`   ✅ Export functionality ${successRate >= 90 ? 'PASSED' : 'NEEDS ATTENTION'}\n`);
    }

    async testPerformance() {
        console.log('6️⃣  PERFORMANCE ANALYSIS');
        console.log('-'.repeat(40));
        
        // Test URL validation performance at scale
        const largeUrlSet = [...TEST_URLS, ...TEST_URLS, ...TEST_URLS]; // Triple the URLs
        
        console.log(`Testing performance with ${largeUrlSet.length} URLs...`);
        
        const startTime = Date.now();
        const validationResult = this.validator.validateBatch(largeUrlSet);
        const endTime = Date.now();
        
        const urlsPerSecond = largeUrlSet.length / ((endTime - startTime) / 1000);
        
        this.results.performanceTest = {
            testSetSize: largeUrlSet.length,
            validationTime: endTime - startTime,
            urlsPerSecond,
            memoryUsage: process.memoryUsage(),
            scalabilityScore: urlsPerSecond > 1000 ? 'Excellent' : urlsPerSecond > 500 ? 'Good' : 'Needs Improvement'
        };
        
        console.log(`📊 Performance Results:`);
        console.log(`   Validation Speed: ${urlsPerSecond.toFixed(0)} URLs/second`);
        console.log(`   Memory Usage: ${(this.results.performanceTest.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
        console.log(`   Scalability: ${this.results.performanceTest.scalabilityScore}`);
        console.log(`   ✅ Performance ${urlsPerSecond >= 500 ? 'PASSED' : 'NEEDS ATTENTION'}\n`);
    }

    async testErrorHandling() {
        console.log('7️⃣  ERROR HANDLING TEST');
        console.log('-'.repeat(40));
        
        const errorTestCases = [
            { url: 'invalid-url', expectedError: 'malformed' },
            { url: 'https://www.espn.com/nfl/player/_/id/123/test', expectedError: 'wrong_domain' },
            { url: 'https://www.pro-football-reference.com/teams/test.htm', expectedError: 'non_player' },
            { url: '', expectedError: 'malformed' }
        ];
        
        const errorResults = [];
        
        for (const testCase of errorTestCases) {
            try {
                const result = this.validator.validateURL(testCase.url);
                
                errorResults.push({
                    testCase: testCase.url || '(empty)',
                    expectedError: testCase.expectedError,
                    actualCategory: result.category,
                    handledCorrectly: result.category === testCase.expectedError,
                    error: result.error
                });
                
                const status = result.category === testCase.expectedError ? '✅' : '❌';
                console.log(`   ${status} "${testCase.url || '(empty)'}": ${result.category}`);
                
            } catch (error) {
                errorResults.push({
                    testCase: testCase.url || '(empty)',
                    expectedError: testCase.expectedError,
                    actualError: error.message,
                    handledCorrectly: false
                });
                
                console.log(`   ❌ "${testCase.url || '(empty)'}": Unexpected error - ${error.message}`);
            }
        }
        
        const correctlyHandled = errorResults.filter(r => r.handledCorrectly).length;
        const errorHandlingRate = (correctlyHandled / errorResults.length) * 100;
        
        this.results.errorHandlingTest = {
            testCases: errorTestCases.length,
            correctlyHandled,
            errorHandlingRate,
            details: errorResults
        };
        
        console.log(`📊 Error Handling Results:`);
        console.log(`   Correctly Handled: ${correctlyHandled}/${errorTestCases.length} (${errorHandlingRate.toFixed(1)}%)`);
        console.log(`   ✅ Error handling ${errorHandlingRate >= 90 ? 'PASSED' : 'NEEDS ATTENTION'}\n`);
    }

    generateFinalReport() {
        console.log('📋 FINAL DIAGNOSTIC REPORT');
        console.log('=' .repeat(60));
        
        // Calculate overall grade
        const scores = [
            this.results.urlValidation?.validationRate >= 95 ? 100 : this.results.urlValidation?.validationRate || 0,
            this.results.httpClientTest?.successRate >= 80 ? 100 : this.results.httpClientTest?.successRate || 0,
            this.results.scrapingTest?.successRate >= 70 ? 100 : this.results.scrapingTest?.successRate || 0,
            this.results.extractionTest?.successRate >= 80 ? 100 : this.results.extractionTest?.successRate || 0,
            this.results.exportTest?.successRate >= 90 ? 100 : this.results.exportTest?.successRate || 0,
            this.results.performanceTest?.urlsPerSecond >= 500 ? 100 : Math.min((this.results.performanceTest?.urlsPerSecond || 0) / 5, 100),
            this.results.errorHandlingTest?.errorHandlingRate >= 90 ? 100 : this.results.errorHandlingTest?.errorHandlingRate || 0
        ];
        
        const overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        
        let grade = 'F';
        if (overallScore >= 90) grade = 'A';
        else if (overallScore >= 80) grade = 'B';
        else if (overallScore >= 70) grade = 'C';
        else if (overallScore >= 60) grade = 'D';
        
        this.results.overallGrade = { score: overallScore, grade };
        
        console.log(`🏆 OVERALL GRADE: ${grade} (${overallScore.toFixed(1)}/100)`);
        console.log('');
        
        // Generate recommendations
        this.generateRecommendations();
        
        if (this.results.recommendations.length > 0) {
            console.log('💡 RECOMMENDATIONS:');
            this.results.recommendations.forEach((rec, index) => {
                const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
                console.log(`   ${priority} ${rec.category.toUpperCase()}: ${rec.message}`);
            });
        } else {
            console.log('✨ No major issues found! Tool is performing well.');
        }
        
        console.log('');
    }

    generateRecommendations() {
        const recommendations = [];
        
        // URL validation recommendations
        if (this.results.urlValidation?.validationRate < 95) {
            recommendations.push({
                priority: 'high',
                category: 'url_validation',
                message: `URL validation rate is ${this.results.urlValidation.validationRate.toFixed(1)}%. Review URL patterns and validation logic.`
            });
        }
        
        // HTTP client recommendations
        if (this.results.httpClientTest?.successRate < 80) {
            recommendations.push({
                priority: 'high',
                category: 'http_client',
                message: `HTTP client success rate is ${this.results.httpClientTest.successRate.toFixed(1)}%. Check network connectivity and rate limiting.`
            });
        }
        
        // Scraping recommendations
        if (this.results.scrapingTest?.successRate < 70) {
            recommendations.push({
                priority: 'high',
                category: 'scraping',
                message: `Scraping success rate is ${this.results.scrapingTest.successRate.toFixed(1)}%. Review target site accessibility and rate limiting.`
            });
        }
        
        // Performance recommendations
        if (this.results.performanceTest?.urlsPerSecond < 500) {
            recommendations.push({
                priority: 'medium',
                category: 'performance',
                message: `Processing speed is ${this.results.performanceTest.urlsPerSecond.toFixed(0)} URLs/sec. Consider optimization for better scalability.`
            });
        }
        
        // Content extraction recommendations
        if (this.results.extractionTest?.averageScore < 500) {
            recommendations.push({
                priority: 'medium',
                category: 'extraction',
                message: `Average extraction score is ${this.results.extractionTest.averageScore.toFixed(1)}. Review content extraction patterns.`
            });
        }
        
        this.results.recommendations = recommendations;
    }

    saveResults() {
        const resultsFile = `diagnostic-results-${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(resultsFile, JSON.stringify(this.results, null, 2));
        console.log(`📁 Detailed results saved to: ${resultsFile}`);
    }

    // Helper methods
    generateMockPlayerHTML() {
        return `
        <html>
        <head><title>Test Player Stats | Pro Football Reference</title></head>
        <body>
            <div id="content">
                <h1 itemprop="name">Test Player</h1>
                <div class="necro-jersey">
                    <strong>QB</strong> #12
                </div>
                <div class="player-info">
                    <p>Height: 6'3"</p>
                    <p>Weight: 230 lbs</p>
                    <p>Born: January 15, 1990 in Houston, TX</p>
                    <p>College: Texas Tech</p>
                    <p>Draft: 2017 Kansas City Chiefs, Round 1, Pick 10</p>
                </div>
                
                <table class="stats_table" id="passing">
                    <thead>
                        <tr><th>Year</th><th>Team</th><th>Games</th><th>Passing Yards</th><th>Touchdowns</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>2023</td><td>KC</td><td>16</td><td>4183</td><td>27</td></tr>
                        <tr><td>2022</td><td>KC</td><td>17</td><td>5250</td><td>41</td></tr>
                        <tr><td>Career</td><td></td><td>100</td><td>28424</td><td>219</td></tr>
                    </tbody>
                </table>
                
                <div class="question">
                    <p>What awards has Test Player won? Test Player has won 2 NFL MVP awards and 1 Super Bowl MVP award.</p>
                </div>
                
                <p>Additional content about Test Player's career and achievements. This player has been one of the most dominant forces in the NFL.</p>
            </div>
        </body>
        </html>
        `;
    }

    generateMockScrapingResults() {
        return [
            {
                index: 0,
                url: TEST_URLS[0],
                success: true,
                text: 'Mock player content with stats and biographical information...',
                metadata: { title: 'Test Player Stats' },
                extractionDebug: {
                    structuredData: {
                        player: {
                            name: 'Test Player',
                            position: 'QB',
                            height: '6\'3"',
                            weight: '230 lbs',
                            college: 'Texas Tech'
                        },
                        statistics: {
                            career: { passingYards: 28424, touchdowns: 219 },
                            seasons: [
                                { year: 2023, passingYards: 4183, touchdowns: 27 }
                            ]
                        },
                        achievements: ['2x NFL MVP', 'Super Bowl MVP']
                    },
                    sportsValidation: { isValid: true, score: 6 }
                }
            }
        ];
    }

    validateExportFormat(exportedData, format) {
        try {
            switch (format) {
                case 'enhanced-csv':
                    return exportedData.includes('player_name') && exportedData.split('\n').length > 1;
                case 'structured-json':
                    const jsonData = JSON.parse(exportedData);
                    return jsonData.exportInfo && jsonData.players;
                case 'player-database':
                    const dbData = JSON.parse(exportedData);
                    return dbData.players && dbData.statistics;
                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    }
}

// Run the diagnostic
async function runDiagnostic() {
    const diagnostic = new DiagnosticTestSuite();
    await diagnostic.runCompleteDiagnostic();
}

if (require.main === module) {
    runDiagnostic().catch(console.error);
}

module.exports = { DiagnosticTestSuite, TEST_URLS };