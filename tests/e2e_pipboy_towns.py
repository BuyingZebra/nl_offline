#!/usr/bin/env python3
"""End-to-end test of the *deployed* island map on a phone-size browser."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

PAGE = "https://buyingzebra.github.io/nl_offline/map-preview.html"

def main():
    Path("work/browser-test").mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=[
            "--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader",
            "--enable-webgl","--ignore-gpu-blocklist"
        ])
        page=browser.new_page(viewport={"width":390,"height":844},device_scale_factor=2,
            is_mobile=True,has_touch=True)
        errors=[]
        page.on("pageerror",lambda err:errors.append(str(err)))
        page.goto(PAGE,wait_until="domcontentloaded",timeout=90000)
        page.wait_for_function("!!window.NL_PREVIEW_DEBUG_MAP",timeout=45000)
        page.wait_for_function("!!window.NL_PREVIEW_DEBUG_MAP.getSource('overture-island-0')",
            timeout=90000)
        details=page.evaluate("""() => {
          const m=window.NL_PREVIEW_DEBUG_MAP;
          return {zoom:m.getZoom(),
            roads:m.getStyle().layers.filter(l=>l.id.startsWith('island-overture-road-')).length,
            trails:m.getStyle().layers.filter(l=>l.id.startsWith('island-overture-trail-')).length,
            source:!!m.getSource('overture-island-0'),
            road_filter:m.getFilter('island-overture-road-0'),
            trail_filter:m.getFilter('island-overture-trail-0')}
        }""")
        assert details["roads"]==4 and details["trails"]==4, details
        assert details["road_filter"]==["==",["get","kind"],"motor_candidate"],details
        assert details["trail_filter"]==["==",["get","kind"],"trail"],details
        page.locator("#search").fill("Wild Cove")
        page.wait_for_timeout(400)
        wilds=page.locator("#results button")
        count=wilds.count()
        assert count>=2, f"Expected multiple separate Wild Cove locations, got {count}"
        places=[wilds.nth(i).inner_text() for i in range(count)]
        wilds.nth(0).click()
        page.wait_for_function("window.NL_PREVIEW_DEBUG_MAP.getZoom()>12",timeout=15000)
        zoom1=page.evaluate("window.NL_PREVIEW_DEBUG_MAP.getZoom()")
        center1=page.evaluate("window.NL_PREVIEW_DEBUG_MAP.getCenter().toArray()")
        page.locator("#search").fill("Wild Cove")
        page.locator("#results button").nth(1).click()
        page.wait_for_function("""(start) => {
          const m=window.NL_PREVIEW_DEBUG_MAP;
          const c=m.getCenter();
          return !m.isMoving() && m.getZoom()>12 &&
                 (Math.abs(c.lng-start[0])>.01 || Math.abs(c.lat-start[1])>.01);
        }""",arg=center1,timeout=30000)
        zoom2=page.evaluate("window.NL_PREVIEW_DEBUG_MAP.getZoom()")
        center2=page.evaluate("window.NL_PREVIEW_DEBUG_MAP.getCenter().toArray()")
        assert zoom2>12, f"Second town didn't zoom into roads: {zoom2}"
        assert abs(center1[0]-center2[0])>.01 or abs(center1[1]-center2[1])>.01, \
            "Same-name towns unexpectedly share one map coordinate"
        page.screenshot(path="work/browser-test/wild-cove-mobile.png",full_page=True)
        result={
            "page":PAGE, "shard_sources":details["roads"],"trail_layers":details["trails"],
            "town_search_entries":places,
            "wild_cove_first":{"zoom":zoom1,"center":center1},
            "wild_cove_second":{"zoom":zoom2,"center":center2},
            "uncaught_page_errors":errors,
            "result":"browser validated map sources, town zoom and distinct Wild Cove entries"
        }
        Path("work/browser-test/result.json").write_text(json.dumps(result,indent=2)+"\n")
        print(json.dumps(result,indent=2),flush=True)
        if errors:raise RuntimeError(f"Uncaught browser JavaScript errors: {errors}")
        browser.close()

if __name__=="__main__":main()
