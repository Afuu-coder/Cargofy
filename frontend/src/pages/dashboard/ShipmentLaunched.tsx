import React from 'react';

export function ShipmentLaunched() {
    return (
        <div className="w-full h-full min-h-screen bg-[#080B12] text-white">
            {/* Original Body Content */}
            
{/*  Transactional Success Canvas (No Shell Navigation)  */}
<main className="w-full max-w-4xl relative">
{/*  Background Ambient Glow  */}
<div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
<div className="w-96 h-96 bg-primary-container/10 rounded-full blur-[100px]"></div>
</div>
<div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 glass-panel rounded-xl ambient-shadow ghost-border overflow-hidden p-8 md:p-12">
{/*  Left Column: Success Message & Summary  */}
<div className="md:col-span-7 flex flex-col justify-center space-y-8 pr-0 md:pr-8">
{/*  Status Header  */}
<div className="flex items-center space-x-4">
<div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
<span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
</div>
<div>
<h1 className="font-headline text-3xl font-bold text-on-surface tracking-tight">Shipment Dispatched Successfully</h1>
<p className="font-label text-sm text-primary mt-1 uppercase tracking-widest">System Status: Live</p>
</div>
</div>
{/*  Core Metadata  */}
<div className="bg-surface-container-low rounded-lg p-5 ghost-border">
<div className="flex items-center justify-between mb-4">
<span className="font-mono text-lg text-secondary">AXN-2024-0948</span>
<span className="font-label text-xs uppercase tracking-wider bg-surface-container-highest px-2 py-1 rounded text-on-surface-variant">Dairy</span>
</div>
<div className="flex items-center space-x-4">
<div className="flex-1">
<p className="font-label text-xs text-on-surface-variant uppercase mb-1">Origin</p>
<p className="font-body text-base font-medium">Guwahati</p>
</div>
<div className="flex flex-col items-center justify-center w-12 relative text-outline">
<div className="h-[2px] w-full bg-outline-variant absolute top-1/2 -translate-y-1/2"></div>
<span className="material-symbols-outlined text-sm bg-surface-container-low z-10 px-1 relative">arrow_forward</span>
</div>
<div className="flex-1 text-right">
<p className="font-label text-xs text-on-surface-variant uppercase mb-1">Destination</p>
<p className="font-body text-base font-medium">Shillong</p>
</div>
</div>
</div>
{/*  Action Buttons  */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
<button className="kinetic-gradient text-on-primary font-label uppercase tracking-wider text-sm font-semibold py-3 px-6 rounded hover:scale-[0.98] transition-transform duration-200 flex items-center justify-center gap-2">
<span className="material-symbols-outlined text-sm">play_arrow</span>
                        Start Simulation
                    </button>
<button className="bg-surface-container text-on-surface font-label uppercase tracking-wider text-sm font-semibold py-3 px-6 rounded ghost-border hover:bg-surface-container-highest hover:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2">
<span className="material-symbols-outlined text-sm">open_in_new</span>
                        Open Detail
                    </button>
<button className="bg-transparent border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline font-label uppercase tracking-wider text-sm py-3 px-6 rounded transition-all duration-200 flex items-center justify-center gap-2">
<span className="material-symbols-outlined text-sm">notifications</span>
                        Send Notification
                    </button>
<button className="bg-transparent text-primary hover:bg-primary/10 font-label uppercase tracking-wider text-sm font-semibold py-3 px-6 rounded transition-all duration-200 flex items-center justify-center gap-2">
<span className="material-symbols-outlined text-sm">add</span>
                        Create Another
                    </button>
</div>
</div>
{/*  Right Column: Operational Checklist / Details  */}
<div className="md:col-span-5 bg-surface-container rounded-lg ghost-border p-6 mt-6 md:mt-0 relative overflow-hidden flex flex-col">
{/*  Decorative top accent  */}
<div className="absolute top-0 left-0 w-full h-1 kinetic-gradient"></div>
<h3 className="font-label text-sm uppercase tracking-widest text-on-surface-variant border-b border-surface-container-highest pb-3 mb-4">Operational Status</h3>
<div className="flex-1 space-y-5">
{/*  Detail Item 1  */}
<div className="flex items-start space-x-3">
<span className="material-symbols-outlined text-primary text-xl mt-0.5">local_shipping</span>
<div>
<p className="font-label text-xs uppercase text-on-surface-variant">Vehicle Assigned</p>
<p className="font-mono text-sm mt-0.5">MH-12-AB-3391</p>
</div>
</div>
{/*  Detail Item 2  */}
<div className="flex items-start space-x-3">
<span className="material-symbols-outlined text-primary text-xl mt-0.5">person</span>
<div>
<p className="font-label text-xs uppercase text-on-surface-variant">Driver</p>
<p className="font-body text-sm mt-0.5">Ramesh Kumar</p>
<p className="font-label text-[10px] text-tertiary mt-1 flex items-center gap-1">
<span className="material-symbols-outlined text-[12px]">chat</span> WhatsApp Notified
                            </p>
</div>
</div>
{/*  Detail Item 3  */}
<div className="flex items-start space-x-3">
<span className="material-symbols-outlined text-primary text-xl mt-0.5">sensors</span>
<div>
<p className="font-label text-xs uppercase text-on-surface-variant">IoT Sensor</p>
<div className="flex items-center gap-2 mt-0.5">
<div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
<p className="font-body text-sm text-primary">Active</p>
</div>
</div>
</div>
{/*  Detail Item 4  */}
<div className="flex items-start space-x-3">
<span className="material-symbols-outlined text-primary text-xl mt-0.5">route</span>
<div>
<p className="font-label text-xs uppercase text-on-surface-variant">Route</p>
<p className="font-body text-sm mt-0.5 text-on-surface">Locked &amp; Optimized</p>
</div>
</div>
{/*  Detail Item 5  */}
<div className="flex items-start space-x-3 bg-surface-container-highest p-3 rounded -mx-3 mt-auto">
<span className="material-symbols-outlined text-secondary text-xl mt-0.5">schedule</span>
<div>
<p className="font-label text-xs uppercase text-secondary">Estimated Arrival</p>
<p className="font-mono text-lg font-medium text-on-surface mt-0.5">11:42 AM</p>
</div>
</div>
</div>
</div>
</div>
</main>

        </div>
    );
}
