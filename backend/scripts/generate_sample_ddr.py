import os
import fitz  # PyMuPDF

def generate_oil_ddr_pdf(output_path: str):
    """
    Generates a realistic Daily Drilling Report (DDR) PDF
    matching SIH 2026 problem statement specifications.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    doc = fitz.open()
    # A4 dimensions: 595 x 842 pt
    page = doc.new_page(width=595, height=842)
    
    # 1. Header & Institutional Banner
    # Top banner background
    page.draw_rect(fitz.Rect(30, 25, 565, 80), color=(0.1, 0.15, 0.25), fill=(0.08, 0.12, 0.22))
    page.draw_line(fitz.Point(30, 80), fitz.Point(565, 80), color=(0.0, 0.7, 0.8), width=2)
    
    page.insert_text(
        fitz.Point(45, 48), 
        "AGATE ENERGY", 
        fontsize=13, 
        fontname="helv", 
        color=(1, 1, 1)
    )
    page.insert_text(
        fitz.Point(45, 65), 
        "DRILLING & WELL SERVICES DIRECTORATE • DULIAJAN - 786602, ASSAM", 
        fontsize=9, 
        fontname="helv", 
        color=(0.0, 0.8, 0.9)
    )
    page.insert_text(
        fitz.Point(395, 48), 
        "DAILY DRILLING REPORT (DDR)", 
        fontsize=11, 
        fontname="helv", 
        color=(1, 0.8, 0.2)
    )
    page.insert_text(
        fitz.Point(415, 65), 
        "REPORT NO: DDR-BGN-04/18", 
        fontsize=8, 
        fontname="helv", 
        color=(0.8, 0.8, 0.8)
    )
    
    # 2. Well & Rig Operational Summary Box
    page.draw_rect(fitz.Rect(30, 95, 565, 175), color=(0.7, 0.7, 0.7), fill=(0.96, 0.97, 0.99))
    page.draw_line(fitz.Point(30, 115), fitz.Point(565, 115), color=(0.8, 0.8, 0.8), width=1)
    page.insert_text(fitz.Point(40, 110), "WELL & OPERATIONAL METRICS", fontsize=9, fontname="helv", color=(0.1, 0.2, 0.4))

    col1_x = 45
    col2_x = 220
    col3_x = 400

    # Row 1
    page.insert_text(fitz.Point(col1_x, 130), "Well ID: OIL-BAGHJAN-4", fontsize=8.5, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(col2_x, 130), "Rig Name: BHEL F-3000 / Rig-14", fontsize=8.5, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(col3_x, 130), "Field: Baghjan (Assam Shelf)", fontsize=8.5, fontname="helv", color=(0, 0, 0))

    # Row 2
    page.insert_text(fitz.Point(col1_x, 146), "Current Depth TVD: 2,465.0 m", fontsize=8.5, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(col2_x, 146), "Current Depth MD: 2,540.0 m", fontsize=8.5, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(col3_x, 146), "Kelly Bushing (KB): +108.5 m MSL", fontsize=8.5, fontname="helv", color=(0, 0, 0))

    # Row 3
    page.insert_text(fitz.Point(col1_x, 162), "Active Horizon: Barail Formation", fontsize=8.5, fontname="helv", color=(0.7, 0.2, 0))
    page.insert_text(fitz.Point(col2_x, 162), "Present Mud Weight: 11.8 ppg", fontsize=8.5, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(col3_x, 162), "24-hr Progress: 48.0 m", fontsize=8.5, fontname="helv", color=(0, 0, 0))

    # 3. 24-Hour Drilling Log Narrative
    page.draw_rect(fitz.Rect(30, 185, 565, 275), color=(0.7, 0.7, 0.7), fill=(1, 1, 1))
    page.draw_line(fitz.Point(30, 203), fitz.Point(565, 203), color=(0.8, 0.8, 0.8), width=1)
    page.insert_text(fitz.Point(40, 198), "24-HOUR OPERATIONAL SUMMARY & DRILLING NARRATIVE", fontsize=9, fontname="helv", color=(0.1, 0.2, 0.4))
    
    narrative = (
        "06:00 - 10:00: Rotary drilling 8-1/2\" hole from 2,417m to 2,425m TVD in Barail Formation with 18 klbs WOB, "
        "110 RPM, 620 gpm flow rate. Standpipe pressure steady at 2,850 psi.\n"
        "10:00 - 13:30: INCIDENT #1 - Sudden loss of returns observed at 2,425.0m TVD. Pit volume dropped 28 bbls. "
        "Halted rotary drilling, pulled bit 10m off bottom. Mixed and pumped 35 bbl high-viscosity nut-plug and mica LCM pill. "
        "Allowed 2.5 hours hesitation soak. Losses successfully cured. Total NPT: 3.5 hrs.\n"
        "13:30 - 18:00: Resumed drilling 8-1/2\" hole to 2,460m TVD with controlled ROP of 9.5 m/h.\n"
        "18:00 - 23:30: INCIDENT #2 - Encountered high-pressure gas kick at 2,460.0m TVD in Barail sand stringer. "
        "Background gas spiked from 1.2% to 9.4% with 16 bbl pit gain. Shut-in well on annular preventer. Recorded SIDPP = 280 psi, "
        "SICP = 350 psi. Displaced kick volume using Driller's Method with 12.2 ppg kill mud. Total NPT: 5.5 hrs.\n"
        "23:30 - 06:00: Reamed tight hole section from 2,460m to 2,465m TVD. Circulated and conditioned drilling mud for logging."
    )
    page.insert_textbox(fitz.Rect(40, 210, 555, 270), narrative, fontsize=7.5, fontname="helv", color=(0.1, 0.1, 0.1))

    # 4. Downhole Incident Log Section (Structured NLP / RAG Training Data)
    page.draw_rect(fitz.Rect(30, 285, 565, 530), color=(0.7, 0.7, 0.7), fill=(0.98, 0.98, 0.99))
    page.draw_line(fitz.Point(30, 305), fitz.Point(565, 305), color=(0.8, 0.8, 0.8), width=1)
    page.insert_text(fitz.Point(40, 300), "DETAILED DOWNHOLE HAZARDS & NPT REMEDIATION RECORDS", fontsize=9, fontname="helv", color=(0.7, 0.1, 0.1))

    # Incident Card 1
    page.draw_rect(fitz.Rect(40, 315, 555, 375), color=(0.9, 0.8, 0.8), fill=(1, 0.97, 0.97))
    page.insert_text(fitz.Point(50, 330), "Incident 1: Lost Circulation (Partial Loss)", fontsize=8.5, fontname="helv", color=(0.7, 0.1, 0))
    page.insert_text(fitz.Point(340, 330), "Depth: 2425.0m TVD | NPT: 3.5 hrs | Severity: HIGH", fontsize=8, fontname="helv", color=(0.3, 0.3, 0.3))
    page.insert_text(fitz.Point(50, 345), "Formation: Barail Formation (Upper Arenaceous Sandstone Member)", fontsize=7.5, fontname="helv", color=(0.2, 0.2, 0.2))
    page.insert_text(fitz.Point(50, 357), "Root Cause: High differential pressure into depleted, micro-fractured reservoir sand causing fluid breakout.", fontsize=7.5, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text(fitz.Point(50, 369), "Mitigation: Mixed and spotted 35 bbl LCM pill with nut-plug and mica. Soaked 2 hours and restored full circulation.", fontsize=7.5, fontname="helv", color=(0, 0.4, 0.1))

    # Incident Card 2
    page.draw_rect(fitz.Rect(40, 385, 555, 445), color=(0.9, 0.8, 0.8), fill=(1, 0.97, 0.97))
    page.insert_text(fitz.Point(50, 400), "Incident 2: Gas Kick (Formation Influx)", fontsize=8.5, fontname="helv", color=(0.8, 0.1, 0))
    page.insert_text(fitz.Point(340, 400), "Depth: 2460.0m TVD | NPT: 5.5 hrs | Severity: CRITICAL", fontsize=8, fontname="helv", color=(0.3, 0.3, 0.3))
    page.insert_text(fitz.Point(50, 415), "Formation: Barail Formation (Overpressured Gas Sand Stringer)", fontsize=7.5, fontname="helv", color=(0.2, 0.2, 0.2))
    page.insert_text(fitz.Point(50, 427), "Root Cause: Formation pore pressure (12.0 ppg equiv) exceeded active mud hydrostatic column resulting in gas influx.", fontsize=7.5, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text(fitz.Point(50, 439), "Mitigation: Shut-in well on annular preventer. Recorded SIDPP and SICP, circulated out influx using Driller's Method with weighted kill mud.", fontsize=7.5, fontname="helv", color=(0, 0.4, 0.1))

    # Incident Card 3
    page.draw_rect(fitz.Rect(40, 455, 555, 515), color=(0.9, 0.8, 0.8), fill=(1, 0.97, 0.97))
    page.insert_text(fitz.Point(50, 470), "Incident 3: Differential Sticking & Packoff", fontsize=8.5, fontname="helv", color=(0.8, 0.3, 0))
    page.insert_text(fitz.Point(340, 470), "Depth: 2480.0m TVD | NPT: 4.0 hrs | Severity: HIGH", fontsize=8, fontname="helv", color=(0.3, 0.3, 0.3))
    page.insert_text(fitz.Point(50, 485), "Formation: Barail Formation (Fissile Marine Shale Contact)", fontsize=7.5, fontname="helv", color=(0.2, 0.2, 0.2))
    page.insert_text(fitz.Point(50, 497), "Root Cause: High hydrostatic overbalance causing drill collars to embed into thick mud cake during stationary survey.", fontsize=7.5, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text(fitz.Point(50, 509), "Mitigation: Pumped 40 bbl Pipe-Lax surfactant soaking pill, applied 45 klbs overpull, and rotated slowly at 15 RPM to free drillstring.", fontsize=7.5, fontname="helv", color=(0, 0.4, 0.1))

    # 5. Mud Parameters & Casing Table
    page.draw_rect(fitz.Rect(30, 540, 565, 680), color=(0.7, 0.7, 0.7), fill=(1, 1, 1))
    page.draw_line(fitz.Point(30, 560), fitz.Point(565, 560), color=(0.8, 0.8, 0.8), width=1)
    page.insert_text(fitz.Point(40, 555), "DRILLING FLUID PROPERTIES & HYDRAULIC LOG", fontsize=9, fontname="helv", color=(0.1, 0.2, 0.4))

    # Draw table grid
    headers = ["Parameter", "Value", "Unit", "Operating Limits", "Engineering Remarks"]
    row_y = 575
    page.insert_text(fitz.Point(45, row_y), "Mud Weight (Density):", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(180, row_y), "11.8 - 12.2", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(260, row_y), "ppg", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(320, row_y), "11.2 - 12.8 ppg", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(420, row_y), "Weighted up with barite post-kick", fontsize=8, fontname="helv")

    row_y += 18
    page.insert_text(fitz.Point(45, row_y), "Plastic Viscosity (PV):", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(180, row_y), "24", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(260, row_y), "cP", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(320, row_y), "18 - 30 cP", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(420, row_y), "Normal hole cleaning condition", fontsize=8, fontname="helv")

    row_y += 18
    page.insert_text(fitz.Point(45, row_y), "Yield Point (YP):", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(180, row_y), "18", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(260, row_y), "lb/100ft2", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(320, row_y), "15 - 22 lb/100ft2", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(420, row_y), "Maintained for Barail cuttings transport", fontsize=8, fontname="helv")

    row_y += 18
    page.insert_text(fitz.Point(45, row_y), "API Fluid Loss:", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(180, row_y), "4.5", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(260, row_y), "ml/30min", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(320, row_y), "< 5.0 ml", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(420, row_y), "PAC-LV polymer filtration control", fontsize=8, fontname="helv")

    row_y += 18
    page.insert_text(fitz.Point(45, row_y), "Equivalent Circulating Density:", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(180, row_y), "12.45", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(260, row_y), "ppg", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(320, row_y), "Fracture Limit: 13.5 ppg", fontsize=8, fontname="helv")
    page.insert_text(fitz.Point(420, row_y), "Safe drilling margin: 1.05 ppg", fontsize=8, fontname="helv")

    # 6. Operational Signatures Footer
    page.draw_rect(fitz.Rect(30, 695, 565, 805), color=(0.8, 0.8, 0.8), fill=(0.98, 0.98, 0.98))
    page.insert_text(fitz.Point(45, 715), "REPORT VALIDATION & CERTIFICATION SIGN-OFF", fontsize=9, fontname="helv", color=(0.1, 0.2, 0.4))
    
    sig_y = 745
    page.insert_text(fitz.Point(50, sig_y), "Prepared by:", fontsize=8, fontname="helv", color=(0.4, 0.4, 0.4))
    page.insert_text(fitz.Point(50, sig_y + 14), "Drilling Engineer / Tour Pusher", fontsize=8, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(50, sig_y + 26), "OIL Field Services, Baghjan Rig 14", fontsize=7.5, fontname="helv", color=(0.4, 0.4, 0.4))

    page.insert_text(fitz.Point(230, sig_y), "Reviewed by:", fontsize=8, fontname="helv", color=(0.4, 0.4, 0.4))
    page.insert_text(fitz.Point(230, sig_y + 14), "Operations Geologist / Petrophysicist", fontsize=8, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(230, sig_y + 26), "Subsurface Directorate, OIL Duliajan", fontsize=7.5, fontname="helv", color=(0.4, 0.4, 0.4))

    page.insert_text(fitz.Point(410, sig_y), "Approved by:", fontsize=8, fontname="helv", color=(0.4, 0.4, 0.4))
    page.insert_text(fitz.Point(410, sig_y + 14), "Superintendent Drilling (Operations)", fontsize=8, fontname="helv", color=(0, 0, 0))
    page.insert_text(fitz.Point(410, sig_y + 26), "AGATE Energy, Corporate HQ", fontsize=7.5, fontname="helv", color=(0.4, 0.4, 0.4))

    doc.save(output_path)
    doc.close()
    print(f"Successfully generated representative sample OIL DDR PDF at: {output_path}")

if __name__ == "__main__":
    import os
    import sys
    # Repo-relative, not an absolute path from whatever machine this was first run on.
    # The filename carries a SAMPLE_ prefix on purpose — see sample_reports/README.md.
    default_out = os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "..", "sample_reports",
        "SAMPLE_representative_OIL_Baghjan_DDR_Well_04.pdf",
    ))
    out = sys.argv[1] if len(sys.argv) > 1 else default_out
    generate_oil_ddr_pdf(out)
