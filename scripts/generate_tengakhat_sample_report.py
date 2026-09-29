"""
Generates an authentic Oil India Limited (OIL) Daily Drilling Report (DDR)
for well OIL-TENGAKHAT-1 with downhole hazard incidents (Gas Kick and Lost Circulation)
that are distinct from its existing database records.
"""

import os
import fitz  # PyMuPDF

def create_tengakhat_ddr(output_path: str = "sample_reports/SAMPLE_representative_OIL_Tengakhat_DDR_Well_01.pdf"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    doc = fitz.open()
    page = doc.new_page(width=595, height=842) # A4 format (points)
    
    # Color palette
    navy = (0.06, 0.17, 0.35)       # #0f2c59
    accent_blue = (0.12, 0.45, 0.75) # #1f73bf
    dark_gray = (0.2, 0.2, 0.2)
    light_gray = (0.94, 0.95, 0.96)
    border_color = (0.75, 0.78, 0.82)
    red_accent = (0.75, 0.15, 0.15)
    amber_accent = (0.85, 0.55, 0.1)
    
    # 1. Header Banner
    page.draw_rect(fitz.Rect(36, 36, 559, 92), color=navy, fill=navy)
    page.insert_text((48, 56), "OIL INDIA LIMITED (A Govt. of India Enterprise)", fontsize=13, fontname="hebo", color=(1, 1, 1))
    page.insert_text((48, 72), "DRILLING & WELL SERVICES DIRECTORATE - DULIAJAN - 786602, ASSAM", fontsize=9, fontname="helv", color=(0.8, 0.88, 1))
    page.insert_text((48, 85), "OPERATIONAL DIGEST & DAILY DRILLING REPORT (DDR)", fontsize=9, fontname="hebo", color=(1, 0.85, 0.4))
    
    page.insert_text((420, 56), "REPORT NO: DDR-TGK-01/24", fontsize=8.5, fontname="hebo", color=(1, 1, 1))
    page.insert_text((420, 70), "DATE: 18-JUN-2024", fontsize=8.5, fontname="helv", color=(0.9, 0.9, 0.9))
    page.insert_text((420, 84), "REPORT STATUS: VERIFIED", fontsize=8.5, fontname="hebo", color=(0.4, 0.9, 0.4))
    
    # 2. Well & Operational Metrics Box
    y_start = 104
    page.draw_rect(fitz.Rect(36, y_start, 559, y_start + 88), color=border_color, fill=light_gray)
    page.draw_rect(fitz.Rect(36, y_start, 559, y_start + 20), color=accent_blue, fill=accent_blue)
    page.insert_text((44, y_start + 14), "1. WELL IDENTIFICATION & RIG OPERATIONAL TELEMETRY", fontsize=9.5, fontname="hebo", color=(1, 1, 1))
    
    col1_x = 46
    col2_x = 210
    col3_x = 390
    
    r1_y = y_start + 36
    r2_y = y_start + 54
    r3_y = y_start + 72
    
    # Col 1
    page.insert_text((col1_x, r1_y), "Well ID: OIL-TENGAKHAT-1", fontsize=9, fontname="hebo", color=navy)
    page.insert_text((col1_x, r2_y), "Field: Tengakhat (Upper Assam)", fontsize=8.5, fontname="helv", color=dark_gray)
    page.insert_text((col1_x, r3_y), "Block: AA-ONN-2015/09", fontsize=8.5, fontname="helv", color=dark_gray)
    
    # Col 2
    page.insert_text((col2_x, r1_y), "Current Depth TVD: 2,160.0 m", fontsize=9, fontname="hebo", color=navy)
    page.insert_text((col2_x, r2_y), "Current Depth MD: 2,225.0 m", fontsize=8.5, fontname="helv", color=dark_gray)
    page.insert_text((col2_x, r3_y), "Active Formation: Barail Formation", fontsize=8.5, fontname="hebo", color=accent_blue)
    
    # Col 3
    page.insert_text((col3_x, r1_y), "Rig: OIL Rig-E2000 (2000 HP)", fontsize=8.5, fontname="helv", color=dark_gray)
    page.insert_text((col3_x, r2_y), "Mud Weight: 11.4 ppg (WBM)", fontsize=8.5, fontname="hebo", color=dark_gray)
    page.insert_text((col3_x, r3_y), "Kelly Bushing (KB): +42.0 m MSL", fontsize=8.5, fontname="helv", color=dark_gray)
    
    # 3. Operations Narrative Section Header
    sec2_y = 206
    page.draw_rect(fitz.Rect(36, sec2_y, 559, sec2_y + 20), color=navy, fill=navy)
    page.insert_text((44, sec2_y + 14), "2. DOWNHOLE HAZARDS, OPERATIONAL INCIDENTS & NPT REMEDIATION RECORDS", fontsize=9.5, fontname="hebo", color=(1, 1, 1))
    
    # Incident 1 Box: Gas Kick (CRITICAL)
    inc1_y = 236
    page.draw_rect(fitz.Rect(36, inc1_y, 559, inc1_y + 115), color=red_accent, fill=(0.99, 0.96, 0.96))
    page.draw_rect(fitz.Rect(36, inc1_y, 559, inc1_y + 22), color=red_accent, fill=red_accent)
    page.insert_text((46, inc1_y + 15), "Incident 1: Gas Kick (Formation Influx & Abnormal Pore Pressure)", fontsize=9.5, fontname="hebo", color=(1, 1, 1))
    page.insert_text((440, inc1_y + 15), "SEVERITY: CRITICAL", fontsize=9, fontname="hebo", color=(1, 0.9, 0.9))
    
    meta_y1 = inc1_y + 36
    page.insert_text((46, meta_y1), "Depth: 2145.0m TVD", fontsize=9, fontname="hebo", color=navy)
    page.insert_text((180, meta_y1), "Formation: Barail Formation", fontsize=9, fontname="hebo", color=navy)
    page.insert_text((360, meta_y1), "NPT: 6.5 hrs", fontsize=9, fontname="hebo", color=red_accent)
    page.insert_text((450, meta_y1), "Severity: CRITICAL", fontsize=9, fontname="hebo", color=red_accent)
    
    rc_text1 = (
        "Root Cause: While drilling 8-1/2\" hole into Barail reservoir sandstone stringer at 2,145m TVD, "
        "encountered an abnormal pore pressure zone (12.2 ppg equivalent). Observed sudden pit gain of +15 bbl, "
        "flow rate increase, and standpipe pressure fluctuation from 2,700 psi down to 2,480 psi."
    )
    mit_text1 = (
        "Mitigation: Stopped rotary and performed immediate flow check (well flowing). Shut-in well on annular preventer. "
        "Recorded SIDPP = 340 psi and SICP = 480 psi. Prepared weighted kill mud in active tanks (11.2 ppg up to 12.1 ppg) "
        "using barite. Circulated out gas influx using Driller's Method across remote choke manifold with zero surface gas release."
    )
    
    page.insert_textbox(fitz.Rect(46, inc1_y + 44, 550, inc1_y + 78), rc_text1, fontsize=8, fontname="helv", color=dark_gray)
    page.insert_textbox(fitz.Rect(46, inc1_y + 78, 550, inc1_y + 112), mit_text1, fontsize=8, fontname="hebo", color=(0.1, 0.35, 0.1))
    
    # Incident 2 Box: Lost Circulation (HIGH)
    inc2_y = 362
    page.draw_rect(fitz.Rect(36, inc2_y, 559, inc2_y + 115), color=amber_accent, fill=(0.99, 0.98, 0.94))
    page.draw_rect(fitz.Rect(36, inc2_y, 559, inc2_y + 22), color=amber_accent, fill=amber_accent)
    page.insert_text((46, inc2_y + 15), "Incident 2: Lost Circulation (Sub-hydrostatic Fractured Zone)", fontsize=9.5, fontname="hebo", color=(1, 1, 1))
    page.insert_text((455, inc2_y + 15), "SEVERITY: HIGH", fontsize=9, fontname="hebo", color=(1, 1, 1))
    
    meta_y2 = inc2_y + 36
    page.insert_text((46, meta_y2), "Depth: 1480.0m TVD", fontsize=9, fontname="hebo", color=navy)
    page.insert_text((180, meta_y2), "Formation: Tipam Sandstone", fontsize=9, fontname="hebo", color=navy)
    page.insert_text((360, meta_y2), "NPT: 4.0 hrs", fontsize=9, fontname="hebo", color=amber_accent)
    page.insert_text((450, meta_y2), "Severity: HIGH", fontsize=9, fontname="hebo", color=amber_accent)
    
    rc_text2 = (
        "Root Cause: Sub-hydrostatic, high-permeability micro-fractured sandstone interval penetrated in Upper Tipam "
        "at 1,480m TVD. Formation fracture breakdown gradient lower than hydrostatic mud column, initiating dynamic "
        "partial mud loss rate of 42 bbl/hr into the formation."
    )
    mit_text2 = (
        "Mitigation: Reduced mud pump flow rate from 520 gpm to 320 gpm to minimize annular ECD. Mixed and spotted "
        "45 bbl blended medium/coarse nut-plug and calcium carbonate LCM pill across loss interval. Soaked pill for 1.5 hours "
        "under low annular backpressure; successfully restored 100% full surface mud returns."
    )
    
    page.insert_textbox(fitz.Rect(46, inc2_y + 44, 550, inc2_y + 78), rc_text2, fontsize=8, fontname="helv", color=dark_gray)
    page.insert_textbox(fitz.Rect(46, inc2_y + 78, 550, inc2_y + 112), mit_text2, fontsize=8, fontname="hebo", color=(0.1, 0.35, 0.1))
    
    # 4. Drilling Fluid & Rheology Table
    tbl_y = 490
    page.draw_rect(fitz.Rect(36, tbl_y, 559, tbl_y + 18), color=navy, fill=navy)
    page.insert_text((44, tbl_y + 13), "3. ACTIVE DRILLING FLUID RHEOLOGY & HYDRAULICS MONITORING", fontsize=9, fontname="hebo", color=(1, 1, 1))
    
    rows = [
        ("Mud Weight (Density):", "11.4 - 12.1 ppg", "Active system weighted up with Barite post-kick kill operation"),
        ("Plastic Viscosity (PV):", "22 cP", "Within API spec (18-28 cP) for efficient Barail cutting transport"),
        ("Yield Point (YP):", "19 lb/100ft2", "Optimized hole cleaning without excessive ECD surging"),
        ("API Fluid Loss (FL):", "4.8 ml/30min", "PAC-LV polymer control preventing deep filtrate invasion"),
        ("Equivalent Circulating Density (ECD):", "12.35 ppg", "Pore pressure margin: +0.25 ppg overbalance maintained safely")
    ]
    
    curr_y = tbl_y + 18
    for i, (param, val, comm) in enumerate(rows):
        bg = light_gray if i % 2 == 0 else (1, 1, 1)
        page.draw_rect(fitz.Rect(36, curr_y, 559, curr_y + 18), color=border_color, fill=bg)
        page.insert_text((46, curr_y + 13), param, fontsize=8.5, fontname="hebo", color=navy)
        page.insert_text((220, curr_y + 13), val, fontsize=8.5, fontname="hebo", color=dark_gray)
        page.insert_text((320, curr_y + 13), comm, fontsize=8, fontname="helv", color=dark_gray)
        curr_y += 18
        
    # 5. Lithology & Horizon Progress
    lith_y = 600
    page.draw_rect(fitz.Rect(36, lith_y, 559, lith_y + 18), color=accent_blue, fill=accent_blue)
    page.insert_text((44, lith_y + 13), "4. STRATIGRAPHIC HORIZON EVALUATION & TARGET TOPS", fontsize=9, fontname="hebo", color=(1, 1, 1))
    
    lith_rows = [
        ("Tipam Sandstone Member", "Top: 1,220m TVD", "Encountered loss zone at 1,480m. Healed with 45 bbl LCM pill."),
        ("Girujan Clay Member", "Top: 1,840m TVD", "Massive impermeable mottled clay. Normal hole condition."),
        ("Barail Main Sandstone Member", "Top: 2,120m TVD", "Gas influx at 2,145m. Killed with 12.1 ppg mud. Drilling resumed.")
    ]
    
    l_curr = lith_y + 18
    for i, (fm, tp, notes) in enumerate(lith_rows):
        bg = light_gray if i % 2 == 0 else (1, 1, 1)
        page.draw_rect(fitz.Rect(36, l_curr, 559, l_curr + 18), color=border_color, fill=bg)
        page.insert_text((46, l_curr + 13), fm, fontsize=8.5, fontname="hebo", color=navy)
        page.insert_text((210, l_curr + 13), tp, fontsize=8.5, fontname="helv", color=dark_gray)
        page.insert_text((320, l_curr + 13), notes, fontsize=8, fontname="helv", color=dark_gray)
        l_curr += 18
        
    # 6. Certification & Signatures Footer
    foot_y = 680
    page.draw_rect(fitz.Rect(36, foot_y, 559, foot_y + 70), color=border_color, fill=light_gray)
    page.draw_rect(fitz.Rect(36, foot_y, 559, foot_y + 18), color=navy, fill=navy)
    page.insert_text((44, foot_y + 13), "5. REPORT SIGN-OFF & REGULATORY VERIFICATION", fontsize=9, fontname="hebo", color=(1, 1, 1))
    
    page.insert_text((46, foot_y + 36), "Prepared By: A. K. Gogoi (Lead Drilling Engineer)", fontsize=8.5, fontname="helv", color=dark_gray)
    page.insert_text((46, foot_y + 52), "Designation: Rig Superintendent, OIL Rig-E2000", fontsize=8, fontname="helv", color=dark_gray)
    
    page.insert_text((310, foot_y + 36), "Verified By: D. K. Baruah (Chief Geologist)", fontsize=8.5, fontname="helv", color=dark_gray)
    page.insert_text((310, foot_y + 52), "Subsurface Directorate, Oil India Limited, Duliajan", fontsize=8, fontname="helv", color=dark_gray)
    
    # Bottom watermark bar
    page.draw_rect(fitz.Rect(36, 765, 559, 785), color=navy, fill=navy)
    page.insert_text((48, 778), "AGATE DIGITAL TWIN INSTITUTIONAL REPOSITORY - CLASSIFIED DRILLING REPORT", fontsize=8, fontname="hebo", color=(1, 1, 1))
    page.insert_text((460, 778), "Page 1 of 1", fontsize=8, fontname="helv", color=(0.8, 0.8, 0.8))
    
    doc.save(output_path)
    doc.close()
    print(f"Successfully generated: {output_path}")

if __name__ == "__main__":
    create_tengakhat_ddr()
