import React from "react";

export function CreateShipmentReview() {
  return (
    <div className="w-full h-full min-h-screen bg-[#080B12] text-white">
      {/* Original Body Content */}

      {/*  TopAppBar  */}
      <header className="bg-[#0A0D14] dark:bg-slate-950 text-[#4DD9AC] dark:text-[#4DD9AC] font-['Space_Grotesk'] tracking-tight docked full-width top-0 h-[56px] bg-surface-container-low border-none shadow-none flex justify-between items-center w-full px-6 z-50 fixed left-0 right-0">
        <div className="flex items-center gap-8">
          <div className="text-2xl font-black text-[#4DD9AC] tracking-tighter cursor-pointer">
            CARGOFY
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a
              className="text-slate-400 font-medium hover:text-slate-200 hover:bg-slate-800/50 transition-colors px-3 py-1.5 rounded-DEFAULT text-sm flex items-center gap-2"
              href="#"
            >
              Monitoring
            </a>
            <a
              className="text-slate-400 font-medium hover:text-slate-200 hover:bg-slate-800/50 transition-colors px-3 py-1.5 rounded-DEFAULT text-sm flex items-center gap-2"
              href="#"
            >
              Intelligence
            </a>
            <a
              className="text-slate-400 font-medium hover:text-slate-200 hover:bg-slate-800/50 transition-colors px-3 py-1.5 rounded-DEFAULT text-sm flex items-center gap-2"
              href="#"
            >
              Comms
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="bg-[#4DD9AC]/10 text-[#4DD9AC] hover:bg-slate-800/50 transition-colors px-4 py-1.5 rounded-DEFAULT text-sm font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create
          </button>
          <div className="flex items-center gap-2">
            <button className="text-slate-400 hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-800/50 transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="text-slate-400 hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-800/50 transition-colors">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
          </div>
        </div>
      </header>
      <div className="flex flex-1 pt-[56px] h-full overflow-hidden">
        {/*  SideNavBar  */}
        <aside className="bg-[#0D1117] dark:bg-[#181b23] text-[#4DD9AC] font-['IBM_Plex_Sans'] text-xs uppercase tracking-widest docked left-0 h-full w-[220px] flat no shadows fixed left-0 top-[56px] flex flex-col h-[calc(100vh-56px)] z-40">
          <div className="p-6 pb-2 border-b border-white/5">
            <h2 className="font-headline font-bold text-sm text-on-surface tracking-normal capitalize">
              Control Tower
            </h2>
            <p className="text-slate-500 text-[10px] tracking-normal capitalize mt-1">
              Live Ops
            </p>
          </div>
          <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
            <a
              className="bg-[#4DD9AC]/10 text-[#4DD9AC] border-r-2 border-[#4DD9AC] Active: scale-[0.98] duration-200 flex items-center gap-3 px-3 py-2.5 rounded-l-DEFAULT"
              href="#"
            >
              <span className="material-symbols-outlined text-[18px]">
                precision_manufacturing
              </span>
              Operations
            </a>
            <a
              className="text-slate-500 font-semibold hover:bg-slate-800/40 hover:text-slate-200 transition-all flex items-center gap-3 px-3 py-2.5 rounded-DEFAULT"
              href="#"
            >
              <span className="material-symbols-outlined text-[18px]">
                analytics
              </span>
              Monitoring
            </a>
            <a
              className="text-slate-500 font-semibold hover:bg-slate-800/40 hover:text-slate-200 transition-all flex items-center gap-3 px-3 py-2.5 rounded-DEFAULT"
              href="#"
            >
              <span className="material-symbols-outlined text-[18px]">
                psychology
              </span>
              Intelligence
            </a>
            <a
              className="text-slate-500 font-semibold hover:bg-slate-800/40 hover:text-slate-200 transition-all flex items-center gap-3 px-3 py-2.5 rounded-DEFAULT"
              href="#"
            >
              <span className="material-symbols-outlined text-[18px]">
                chat
              </span>
              Comms
            </a>
          </nav>
          <div className="p-4 border-t border-white/5 mt-auto">
            <button className="w-full border border-error/30 text-error hover:bg-error/10 transition-colors py-2 px-3 rounded-DEFAULT flex items-center justify-center gap-2 text-[10px] font-bold">
              <span className="material-symbols-outlined text-[14px]">
                warning
              </span>
              Emergency Response
            </button>
          </div>
          <div className="flex flex-col gap-1 px-3 pb-6">
            <a
              className="text-slate-500 font-semibold hover:bg-slate-800/40 hover:text-slate-200 transition-all flex items-center gap-3 px-3 py-2 rounded-DEFAULT"
              href="#"
            >
              <span className="material-symbols-outlined text-[16px]">
                settings
              </span>
              Settings
            </a>
            <a
              className="text-slate-500 font-semibold hover:bg-slate-800/40 hover:text-slate-200 transition-all flex items-center gap-3 px-3 py-2 rounded-DEFAULT"
              href="#"
            >
              <span className="material-symbols-outlined text-[16px]">
                help
              </span>
              Support
            </a>
          </div>
        </aside>
        {/*  Main Wizard Column  */}
        <main className="flex-1 ml-[220px] bg-surface-container-lowest overflow-y-auto overflow-x-hidden flex flex-col items-center py-8 px-6">
          <div className="w-full max-w-4xl flex flex-col gap-6">
            {/*  Wizard Header  */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="font-headline text-2xl font-bold text-on-surface">
                  Review &amp; Dispatch
                </h1>
                <p className="font-body text-sm text-on-surface-variant mt-1 flex items-center gap-2">
                  Step 5 of 5
                  <span className="h-1 w-1 rounded-full bg-primary inline-block"></span>
                  Ready for launch
                </p>
              </div>
              <div className="font-mono text-primary text-sm flex items-center gap-2 bg-surface-container py-1.5 px-3 rounded-DEFAULT border border-outline-variant/15">
                <span className="relative flex h-2 w-2 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                ID: AXN-2024-0948
              </div>
            </div>
            {/*  High-Density Summary Card  */}
            <div className="bg-surface-container-low rounded-lg p-6 flex flex-col gap-6 relative overflow-hidden group">
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary-container"></div>
              {/*  Top Section: Cargo & Route  */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/*  Left Side: Cargo  */}
                <div className="flex flex-col gap-4">
                  <h3 className="font-label text-xs uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">
                      inventory_2
                    </span>
                    Cargo Specifications
                  </h3>
                  <div className="bg-surface-container rounded-DEFAULT p-4 flex gap-4 items-start">
                    <div className="h-12 w-12 rounded-DEFAULT bg-surface-container-highest flex items-center justify-center flex-shrink-0 border border-outline-variant/10">
                      <span className="material-symbols-outlined text-primary text-[24px]">
                        water_drop
                      </span>
                    </div>
                    <div className="flex flex-col flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-headline font-semibold text-on-surface">
                          Dairy - Milk
                        </span>
                        <span className="font-mono text-sm text-on-surface-variant">
                          420 Litres
                        </span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <span className="bg-tertiary-container/10 text-tertiary-container text-[10px] font-label px-2 py-0.5 rounded-DEFAULT uppercase tracking-wider">
                          High Priority
                        </span>
                        <span className="bg-primary/10 text-primary text-[10px] font-label px-2 py-0.5 rounded-DEFAULT uppercase tracking-wider">
                          Fresh
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {/*  Right Side: Route  */}
                <div className="flex flex-col gap-4">
                  <h3 className="font-label text-xs uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">
                      route
                    </span>
                    Route &amp; Schedule
                  </h3>
                  <div className="bg-surface-container rounded-DEFAULT p-4 flex flex-col gap-4 relative">
                    <div className="flex justify-between items-center relative z-10">
                      <div className="flex flex-col">
                        <span className="font-headline font-semibold text-on-surface">
                          Guwahati
                        </span>
                        <span className="font-mono text-xs text-on-surface-variant mt-0.5">
                          Pickup: 14 Oct 07:00
                        </span>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center px-4">
                        <span className="font-mono text-[10px] text-on-surface-variant mb-1">
                          214 km
                        </span>
                        <div className="w-full h-[1px] bg-outline-variant/30 relative">
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-outline-variant">
                            <span className="material-symbols-outlined text-[14px]">
                              chevron_right
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-headline font-semibold text-on-surface">
                          Shillong
                        </span>
                        <span className="font-mono text-xs text-secondary mt-0.5">
                          SLA: 12:00
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/*  Bottom Section: Logistics & Monitoring  */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                <div className="bg-surface-container rounded-DEFAULT p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-surface-container-highest flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                      local_shipping
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
                      Assigned Vehicle &amp; Driver
                    </span>
                    <span className="font-body text-sm font-medium text-on-surface mt-0.5">
                      MH-12-AB-3391{" "}
                      <span className="text-outline-variant mx-1">•</span>{" "}
                      Ramesh Kumar
                    </span>
                  </div>
                </div>
                <div className="bg-surface-container rounded-DEFAULT p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-surface-container-highest flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                      sensors
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
                      Monitoring Active
                    </span>
                    <span className="font-body text-sm font-medium text-on-surface mt-0.5">
                      IoT-4821{" "}
                      <span className="text-outline-variant mx-1">•</span>{" "}
                      WhatsApp Alerts
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {/*  Risk Preview Section (Asymmetrical Layout)  */}
            <div className="mt-4 flex flex-col gap-4">
              <h2 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary">
                  warning
                </span>
                Risk Assessment
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-container-low rounded-DEFAULT p-4 flex flex-col border border-outline-variant/15">
                  <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">
                    Route Health
                  </span>
                  <span className="font-headline text-lg font-semibold text-tertiary">
                    Medium
                  </span>
                  <span className="font-body text-xs text-on-surface-variant mt-2 border-t border-outline-variant/20 pt-2">
                    Traffic delays expected near bypass.
                  </span>
                </div>
                <div className="bg-surface-container-low rounded-DEFAULT p-4 flex flex-col border border-outline-variant/15 relative overflow-hidden">
                  <div className="absolute right-0 top-0 h-full w-[2px] bg-error"></div>
                  <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">
                    Spoilage Sens.
                  </span>
                  <span className="font-headline text-lg font-semibold text-error">
                    High
                  </span>
                  <span className="font-body text-xs text-on-surface-variant mt-2 border-t border-outline-variant/20 pt-2">
                    Requires continuous 2-4°C temp.
                  </span>
                </div>
                <div className="bg-surface-container-low rounded-DEFAULT p-4 flex flex-col border border-outline-variant/15">
                  <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">
                    Excursion Risk
                  </span>
                  <div className="flex items-end gap-2">
                    <span className="font-mono text-2xl text-on-surface leading-none">
                      18%
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-primary mb-1">
                      trending_down
                    </span>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1 rounded-full mt-3 overflow-hidden">
                    <div className="bg-primary h-full w-[18%]"></div>
                  </div>
                </div>
              </div>
            </div>
            {/*  Actions  */}
            <div className="mt-8 flex items-center justify-end gap-4 border-t border-outline-variant/20 pt-6">
              <button className="font-label text-sm font-semibold text-primary px-6 py-2.5 rounded-DEFAULT hover:bg-primary/10 transition-colors">
                Back to Edit
              </button>
              <button className="kinetic-gradient text-on-primary font-label text-sm font-bold px-8 py-2.5 rounded-DEFAULT flex items-center gap-2 hover:scale-[0.98] transition-transform shadow-[0_0_15px_rgba(110,246,199,0.2)]">
                Confirm &amp; Dispatch
                <span className="material-symbols-outlined text-[18px]">
                  send
                </span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
