import React from 'react';
import { Link } from 'react-router-dom';

export const WhyCargofyPage: React.FC = () => {
  return (
    <div className="dark bg-[#10131b] text-[#e0e2ed] min-h-screen flex flex-col font-['Inter']">
      
{/*  TopNavBar (Shared Component)  */}
<nav className="fixed top-0 w-full z-50 bg-[#10131b]/80 backdrop-blur-xl shadow-2xl shadow-black/40 border-b border-transparent transition-colors duration-300">
<div className="flex justify-between items-center px-8 h-20 w-full max-w-screen-2xl mx-auto">
{/*  Brand  */}
<a className="text-2xl font-bold tracking-tighter text-[#4DD9AC] font-headline" href="/">CARGOFY</a>
{/*  Navigation Links (Desktop)  */}
<div className="hidden md:flex space-x-8 items-center font-label">
<Link className="text-slate-400 hover:text-slate-100 transition-colors hover:bg-[#1d2027] hover:text-[#4DD9AC] px-3 py-2 rounded"  to="/solutions">Solutions</Link>
{/*  Active State Applied Here  */}
<a className="text-[#4DD9AC] font-semibold border-b-2 border-[#4DD9AC] pb-1 hover:bg-[#1d2027] px-3 py-2 rounded" href="/">Customer Stories</a>
<a className="text-slate-400 hover:text-slate-100 transition-colors hover:bg-[#1d2027] hover:text-[#4DD9AC] px-3 py-2 rounded" href="/">About</a>
<a className="text-slate-400 hover:text-slate-100 transition-colors hover:bg-[#1d2027] hover:text-[#4DD9AC] px-3 py-2 rounded" href="/">Resources</a>
</div>
{/*  Actions  */}
<div className="hidden md:flex space-x-4 items-center">
<Link className="text-slate-400 hover:text-[#4DD9AC] font-label transition-colors px-4 py-2 hover:bg-[#1d2027] rounded"  to="/login">Login</Link>
<a className="gradient-live text-[#005b44] font-label px-6 py-2 rounded-lg font-semibold hover:scale-95 duration-150 ease-in-out transition-transform" href="/">Get a Demo</a>
</div>
{/*  Mobile Menu Toggle  */}
<button className="md:hidden text-[#4DD9AC] p-2">
<span className="material-symbols-outlined">menu</span>
</button>
</div>
</nav>
{/*  Main Content Canvas  */}
<main className="flex-grow flex flex-col items-center w-full relative">
{/*  Background Ambient Glow  */}
<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10"></div>
{/*  Hero Section  */}
<section className="w-full max-w-screen-2xl mx-auto px-8 py-24 md:py-32 flex flex-col items-center text-center relative z-10">
<div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 mb-8 ghost-border">
<span className="w-2 h-2 rounded-full bg-primary relative"><span className="absolute w-full h-full bg-primary rounded-full ping-dot opacity-75"></span></span>
<span className="font-data text-xs text-primary-container tracking-wider uppercase">Live Impact Metrics</span>
</div>
<h1 className="text-5xl md:text-7xl font-bold font-headline mb-6 text-on-surface max-w-4xl leading-tight tracking-tight">
                Results That Speak for <span className="text-primary-container">Themselves.</span>
</h1>
<p className="text-lg md:text-xl text-on-surface-variant font-body max-w-2xl mb-16 leading-relaxed">
                Powering India's leading cold chain operations. See how we turn logistical black holes into high-performance, visible networks.
            </p>
{/*  Hero KPI Bar (Asymmetric)  */}
<div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-1 relative">
{/*  Data Node 1  */}
<div className="bg-surface-container-low p-8 flex flex-col border-l-2 border-primary-container ghost-border">
<span className="font-data text-sm text-on-surface-variant mb-2">Total Savings Generated</span>
<span className="font-headline text-4xl font-bold text-on-surface">₹42 Crore</span>
</div>
{/*  Data Node 2  */}
<div className="bg-surface-container p-8 flex flex-col border-l-2 border-secondary ghost-border translate-y-4 md:translate-y-0 relative z-10 ambient-shadow">
<span className="font-data text-sm text-on-surface-variant mb-2">Shipments Monitored</span>
<span className="font-headline text-4xl font-bold text-on-surface">2.4M<span className="text-secondary text-2xl">+</span></span>
</div>
{/*  Data Node 3  */}
<div className="bg-surface-container-low p-8 flex flex-col border-l-2 border-primary-container ghost-border md:translate-y-8">
<span className="font-data text-sm text-on-surface-variant mb-2">Spoilage Reduction Avg</span>
<span className="font-headline text-4xl font-bold text-on-surface">68%</span>
</div>
</div>
</section>
{/*  Trusted Brands (Greyscale Logo Wall)  */}
<section className="w-full bg-surface-container-lowest py-16 border-y border-surface-container">
<div className="max-w-screen-2xl mx-auto px-8 flex flex-col items-center">
<span className="font-label text-xs text-on-surface-variant uppercase tracking-widest mb-8">Trusted by Operational Leaders</span>
<div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
{/*  Placeholder Logos (Text for demo purposes, representing image tags)  */}
<div className="font-headline text-xl font-bold text-on-surface tracking-tighter">DAIRYCORP</div>
<div className="font-headline text-xl font-bold text-on-surface tracking-tighter">OCEANFRESH</div>
<div className="font-headline text-xl font-bold text-on-surface tracking-tighter">PHARMALINK</div>
<div className="font-headline text-xl font-bold text-on-surface tracking-tighter">COLDLOGIX</div>
<div className="font-headline text-xl font-bold text-on-surface tracking-tighter">FMCGNODE</div>
</div>
</div>
</section>
{/*  Featured Case Study (Full Width Card)  */}
<section className="w-full max-w-screen-2xl mx-auto px-8 py-24 relative">
<div className="flex flex-col md:flex-row bg-surface-container-low rounded-xl overflow-hidden relative group">
{/*  Background Image Side  */}
<div className="w-full md:w-1/2 h-64 md:h-auto relative overflow-hidden bg-surface-container-high">
<img alt="Industrial dairy processing plant interior with stainless steel vats and modern monitoring equipment" className="w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity duration-700 mix-blend-luminosity" data-alt="Industrial dairy processing plant interior with stainless steel vats and modern monitoring equipment, cinematic dark lighting, sharp focus" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAq415_QNTOkrVC94v90pH5_RMOzOubE__7bj7ml7lowrRSsd1gkD6kDhyq45x2RMf6f_S9oIk1uwhC0Sj9BgDohIzb0rrCPYdYg3wKWx9jy_zasmmQpo7ouup-3Lna3mW5mF286jsxMk4-TricV3mGhH2HIhRiDPYznE6B20cJhLRZ3LfAV7S7Q2SIqg6WLNCxuL9Dot_pGwXjslCvC3JPYgb_2AG3lQpVbi8B3hPS13xbgZwIIPiS12_DPaYrryB8ZP8jP3gg_BTu"/>
<div className="absolute inset-0 bg-gradient-to-r from-surface-container-low to-transparent md:hidden"></div>
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-low to-transparent md:hidden"></div>
</div>
{/*  Content Side  */}
<div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center relative z-10 -ml-0 md:-ml-12 bg-gradient-to-r from-surface-container-low via-surface-container-low to-transparent">
<div className="flex items-center gap-3 mb-6">
<span className="bg-surface-container-highest text-primary-container px-3 py-1 rounded-sm font-label text-xs uppercase tracking-wider ghost-border">Featured Mission</span>
<span className="font-data text-sm text-on-surface-variant">ID: DRY-NE-001</span>
</div>
<h2 className="text-3xl md:text-4xl font-bold font-headline mb-4 text-on-surface">Large Dairy Brand in Northeast India</h2>
<p className="text-on-surface-variant font-body mb-10 leading-relaxed max-w-lg">
                        Overcoming erratic power grids and challenging terrain to establish a secure, FSSAI-compliant cold chain network for sensitive dairy products.
                    </p>
{/*  Metrics Grid within Featured  */}
<div className="grid grid-cols-2 gap-x-8 gap-y-6 mb-8">
<div>
<span className="font-data text-xs text-on-surface-variant block mb-1 uppercase">Loss Reduction</span>
<span className="font-headline text-2xl font-bold text-primary-container">71%</span>
</div>
<div>
<span className="font-data text-xs text-on-surface-variant block mb-1 uppercase">Monthly Savings</span>
<span className="font-headline text-2xl font-bold text-primary-container">₹2.8L</span>
</div>
<div>
<span className="font-data text-xs text-on-surface-variant block mb-1 uppercase">Alert Response Time</span>
<span className="font-headline text-2xl font-bold text-on-surface">4.2 min</span>
</div>
<div>
<span className="font-data text-xs text-on-surface-variant block mb-1 uppercase">FSSAI Compliance</span>
<span className="font-headline text-2xl font-bold text-on-surface">91%</span>
</div>
</div>
<div>
<a className="inline-flex items-center gap-2 text-primary hover:text-primary-container font-label text-sm uppercase tracking-wider transition-colors group/link" href="/">
                            View Full Report 
                            <span className="material-symbols-outlined text-sm group-hover/link:translate-x-1 transition-transform">arrow_forward</span>
</a>
</div>
</div>
</div>
</section>
{/*  Filter Tabs & Grid  */}
<section className="w-full max-w-screen-2xl mx-auto px-8 py-16">
{/*  Filter Tabs  */}
<div className="flex flex-wrap gap-2 mb-12 border-b border-surface-container pb-4">
<button className="px-4 py-2 bg-surface-container-highest text-primary-container font-label text-sm rounded-t-lg border-b-2 border-primary-container">All Industries</button>
<button className="px-4 py-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-label text-sm rounded-t-lg transition-colors">Dairy</button>
<button className="px-4 py-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-label text-sm rounded-t-lg transition-colors">Seafood</button>
<button className="px-4 py-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-label text-sm rounded-t-lg transition-colors">Pharma</button>
<button className="px-4 py-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-label text-sm rounded-t-lg transition-colors">Frozen</button>
<button className="px-4 py-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-label text-sm rounded-t-lg transition-colors">FMCG</button>
</div>
{/*  Bento Grid layout for smaller stories  */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
{/*  Card 1: Seafood  */}
<div className="bg-surface-container-low p-6 flex flex-col border-t-2 border-secondary relative group overflow-hidden ghost-border hover:bg-surface-container transition-colors duration-300">
<div className="flex justify-between items-start mb-6">
<span className="font-data text-xs text-on-surface-variant bg-surface-container-highest px-2 py-1 rounded">SEAFOOD EXPORT</span>
<span className="material-symbols-outlined text-secondary">sailing</span>
</div>
<h3 className="text-xl font-bold font-headline mb-2 text-on-surface">Coastal Catch Logistics</h3>
<p className="text-sm font-body text-on-surface-variant mb-8 flex-grow">Eliminated port-side temperature abuse during crucial handover phases.</p>
<div className="bg-surface-container-highest p-4 rounded-lg flex justify-between items-center mt-auto">
<div className="flex flex-col">
<span className="font-data text-[10px] text-on-surface-variant uppercase">Before</span>
<span className="font-data text-lg text-error">14% <span className="text-xs text-on-surface-variant">Spoilage</span></span>
</div>
<span className="material-symbols-outlined text-outline-variant">arrow_right_alt</span>
<div className="flex flex-col text-right">
<span className="font-data text-[10px] text-on-surface-variant uppercase">After</span>
<span className="font-data text-lg text-primary-container">1.2% <span className="text-xs text-on-surface-variant">Spoilage</span></span>
</div>
</div>
</div>
{/*  Card 2: Pharma  */}
<div className="bg-surface-container-low p-6 flex flex-col border-t-2 border-primary-container relative group overflow-hidden ghost-border hover:bg-surface-container transition-colors duration-300">
<div className="flex justify-between items-start mb-6">
<span className="font-data text-xs text-on-surface-variant bg-surface-container-highest px-2 py-1 rounded">VACCINE DIST.</span>
<span className="material-symbols-outlined text-primary-container">vaccines</span>
</div>
<h3 className="text-xl font-bold font-headline mb-2 text-on-surface">National Health Corp</h3>
<p className="text-sm font-body text-on-surface-variant mb-8 flex-grow">Secured last-mile delivery integrity for temperature-sensitive mRNA vaccines across tier-2 cities.</p>
<div className="bg-surface-container-highest p-4 rounded-lg flex justify-between items-center mt-auto">
<div className="flex flex-col">
<span className="font-data text-[10px] text-on-surface-variant uppercase">Before</span>
<span className="font-data text-lg text-tertiary">8.5% <span className="text-xs text-on-surface-variant">Excursions</span></span>
</div>
<span className="material-symbols-outlined text-outline-variant">arrow_right_alt</span>
<div className="flex flex-col text-right">
<span className="font-data text-[10px] text-on-surface-variant uppercase">After</span>
<span className="font-data text-lg text-primary-container">0.3% <span className="text-xs text-on-surface-variant">Excursions</span></span>
</div>
</div>
</div>
{/*  Card 3: Frozen  */}
<div className="bg-surface-container-low p-6 flex flex-col border-t-2 border-outline-variant relative group overflow-hidden ghost-border hover:bg-surface-container transition-colors duration-300">
<div className="flex justify-between items-start mb-6">
<span className="font-data text-xs text-on-surface-variant bg-surface-container-highest px-2 py-1 rounded">FROZEN FOODS</span>
<span className="material-symbols-outlined text-on-surface-variant">ac_unit</span>
</div>
<h3 className="text-xl font-bold font-headline mb-2 text-on-surface">Arctic Foods India</h3>
<p className="text-sm font-body text-on-surface-variant mb-8 flex-grow">Optimized compressor cycling alerts to prevent deep-freeze thaw during long hauls.</p>
<div className="bg-surface-container-highest p-4 rounded-lg flex justify-between items-center mt-auto">
<div className="flex flex-col">
<span className="font-data text-[10px] text-on-surface-variant uppercase">Before</span>
<span className="font-data text-lg text-error">11% <span className="text-xs text-on-surface-variant">Spoilage</span></span>
</div>
<span className="material-symbols-outlined text-outline-variant">arrow_right_alt</span>
<div className="flex flex-col text-right">
<span className="font-data text-[10px] text-on-surface-variant uppercase">After</span>
<span className="font-data text-lg text-primary-container">2.1% <span className="text-xs text-on-surface-variant">Spoilage</span></span>
</div>
</div>
</div>
</div>
</section>
</main>
{/*  Footer (Shared Component)  */}
<footer className="w-full py-16 bg-[#10131b] text-[#4DD9AC]">
<div className="grid grid-cols-1 md:grid-cols-4 gap-12 px-8 max-w-screen-2xl mx-auto border-t border-[#32353d]/20 pt-16">
{/*  Brand Column  */}
<div className="flex flex-col">
<span className="text-xl font-black text-[#4DD9AC] font-headline mb-4">CARGOFY</span>
<span className="font-label text-slate-500 text-sm">© 2024 CARGOFY Intelligence. Precision in every degree.</span>
</div>
{/*  Links Column  */}
<div className="flex flex-col space-y-3 font-label text-sm">
<a className="text-slate-500 hover:text-[#4DD9AC] transition-colors opacity-80 hover:opacity-100" href="/">Privacy Policy</a>
<a className="text-slate-500 hover:text-[#4DD9AC] transition-colors opacity-80 hover:opacity-100" href="/">Terms of Service</a>
<a className="text-slate-500 hover:text-[#4DD9AC] transition-colors opacity-80 hover:opacity-100" href="/">Compliance</a>
<a className="text-slate-500 hover:text-[#4DD9AC] transition-colors opacity-80 hover:opacity-100" href="/">Contact</a>
</div>
{/*  Empty Cols for grid structure based on layout  */}
<div></div>
<div></div>
</div>
</footer>

    </div>
  );
};

export default WhyCargofyPage;
