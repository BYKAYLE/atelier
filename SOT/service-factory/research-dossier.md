# Stella Factory K-Dense Research Dossier

generated_at: 2026-07-29T23:52:44+09:00

## Goal

Atelier Stella Factory를 Antigravity식 다중 에이전트 자율 개발 공장으로 고도화한다. 단일 기능 완료로 종료하지 않고 research, capability map, agent topology, dispatch/collect, Probe, security, release, final audit, heartbeat-ready continuation까지 이어간다.

## K-Dense Availability

- skill: `/Users/kansic/.agents/skills/k-dense-ai/SKILL.md`
- status: present
- catalog_sample_loaded: true


## Focus

- Route scientific/technical/product research through k-dense when applicable.
- Select candidate skills such as `research-lookup`, `paper-lookup`, `literature-review`, `database-lookup`, `scholar-evaluation`, `scientific-critical-thinking`, and domain package skills.
- Produce hypotheses, counter-hypotheses, source tiers, and decision implications before planning.


## Research Contract

- Facts, inference, and opinion must be separated.
- Claims need source/evidence quality labels.
- Research must include at least one disconfirming path or explicit reason it is unavailable.
- Planning cannot claim readiness from research alone; it must feed implementation and gate evidence.

## Candidate K-Dense Catalog Signals

```text
# Scientific Skills

## Scientific Databases & Data Access

- **Database Lookup** - Search 78 public scientific, biomedical, materials science, and economic databases via their REST APIs and return structured JSON results. Covers physics/astronomy (NASA, NIST, SDSS, SIMBAD, Exoplanet Archive), earth/environment (USGS, NOAA, EPA, OpenWeatherMap), chemistry/drugs (PubChem, ChEMBL, DrugBank, FDA, KEGG, DailyMed, ZINC, BindingDB), materials science (Materials Project, COD), biology/genomics (Reactome, BRENDA, UniProt, STRING, Ensembl, NCBI Gene, GEO, GTEx, PDB, AlphaFold, InterPro, ChEBI, BioGRID, Gene Ontology, QuickGO, NCBI Protein/Taxonomy, dbSNP, SRA, ENA, gnomAD, UCSC Genome, ENCODE, JASPAR, MouseMine, PRIDE, LINCS L1000, Human Protein Atlas, Human Cell Atlas, RummaGEO, Metabolomics Workbench, EMDB, Addgene), disease/clinical (COSMIC, Open Targets, ClinPGx, ClinicalTrials.gov, OMIM, ClinVar, GDC/TCGA, cBioPortal, DisGeNET, GWAS Catalog, Monarch, HPO), regulatory (FDA, USPTO, SEC EDGAR), economics/finance (FRED, BEA, BLS, Federal Reserve, World Bank, ECB, US Treasury, Alpha Vantage, Data Commons), and demographics (US Census, Eurostat, WHO). Use this skill whenever the user wants to look up compounds, drugs, proteins, genes, pathways, enzymes, gene expression, variants, clinical trials, patents, SEC filings, economic indicators, crystal structures, astronomical objects, earthquakes, weather, or any data from a public database API
- **DepMap** - Query the Cancer Dependency Map (DepMap) for cancer cell line gene dependency scores (CRISPR Chronos), drug sensitivity data, and gene effect profiles. Use for identifying cancer-specific vulnerabilities, synthetic lethal interactions, and validating oncology drug targets
- **Imaging Data Commons** - Query and download public cancer imaging data from NCI Imaging Data Commons using idc-index. Use for accessing large-scale radiology (CT, MR, PET) and pathology datasets for AI training or research. No authentication required. Query by metadata, visualize in browser, check licenses
- **PrimeKG** - Query the Precision Medicine Knowledge Graph (PrimeKG) for multiscale biological data including genes, drugs, diseases, phenotypes, and more. Integrates 20+ biomedical resources into a single knowledge graph for drug repurposing, disease mechanism exploration, and target identification
- **U.S. Treasury Fiscal Data** - Free, open REST API from the U.S. Department of the Treasury providing 54 datasets and 179 data tables covering federal fiscal data. No API key required. Access national debt (Debt to the Penny back to 1993, Historical Debt back to 1790), Daily Treasury Statements (TGA balances, deposits/withdrawals), Monthly Treasury Statements (federal budget receipts and outlays), Treasury securities auctions data (bills, notes, bonds, TIPS, FRNs since 1979), average interest rates on Treasury securities, Treasury reporting exchange rates (quarterly for 170+ currencies), I Bond and savings bond rates, TIPS/CPI data, and more. Supports filtering, sorting, pagination, and CSV/XML/JSON output formats
- **Hugging Science** - Curated, LLM-friendly catalog of scientific datasets, models, blog posts, and interactive Spaces hosted on Hugging Face, spanning 17 scientific domains (astronomy, benchmark, biology, biotechnology, chemistry, climate, conservation, earth-science, ecology, energy, engineering, genomics, materials-science, mathematics, medicine, physics, scientific-reasoning). Discovery happens via huggings
```
