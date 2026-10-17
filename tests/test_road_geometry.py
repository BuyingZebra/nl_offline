"""Regression checks: segmentation is normal, doubling is not."""
import importlib.util
import unittest
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString


spec=importlib.util.spec_from_file_location(
    "reconcile_road_sources",
    Path(__file__).resolve().parents[1] / "tools/reconcile_road_sources.py"
)
road=importlib.util.module_from_spec(spec)
spec.loader.exec_module(road)


def roads(shapes, names=None):
    values = {"geometry": shapes}
    if names:
        values["name"] = names
    return gpd.GeoDataFrame(values, geometry="geometry", crs="EPSG:3347")


class ConflationTests(unittest.TestCase):
    def test_street_name_equivalence(self):
        self.assertEqual(road.normalized_name("D’Iberville Street"),
                         road.normalized_name("D Iberville St"))
        self.assertEqual(road.normalized_name("D'iberville St."),
                         "diberville")

    def test_one_road_in_several_osm_segments(self):
        # The displayed road is one physical centreline, broken into source
        # segments at intersections; it MUST classify as OSM overlap.
        osm = road.IndexedRoads(roads([
            LineString([(0, 0), (60, 0)]),
            LineString([(60, 0), (120, 0)]),
        ], ["D'Iberville Street", "D'Iberville St."]), "name")
        provincial = LineString([(0, 2), (120, 2)])
        fraction, names, _ = osm.overlap(provincial, 10)
        self.assertGreater(fraction, .82)
        self.assertEqual(road.assign_status(fraction, 0, 120,
                         road.normalized_name("D'Iberville Street"), names),
                         "duplicate_osm")

    def test_cross_street_does_not_fool_overlap(self):
        osm = road.IndexedRoads(roads([LineString([(50, -70), (50, 70)])]))
        parallel_road = LineString([(0, 0), (100, 0)])
        fraction, _, _ = osm.overlap(parallel_road, 10)
        self.assertLessEqual(fraction, .20)
        self.assertEqual(road.assign_status(fraction, .0, 100),
                         "candidate_addition")

    def test_distinct_parallel_road_outside_tolerance(self):
        osm = road.IndexedRoads(roads([LineString([(0, 0), (100, 0)])]))
        other_road = LineString([(0, 22), (100, 22)])
        fraction, _, _ = osm.overlap(other_road, 10)
        self.assertEqual(fraction, 0)

    def test_name_conflict_kept_for_review(self):
        self.assertEqual(road.assign_status(.95, 0., 100,
                         "diberville", {"differentroad"}), "name_conflict")

    def test_nrn_only_not_hidden(self):
        self.assertEqual(road.assign_status(.0, .95, 80), "nrn_only")

    def test_no_automatic_merge_for_uncertain_alignment(self):
        self.assertEqual(road.assign_status(.6, .4, 100), "alignment_review")


if __name__ == "__main__":
    unittest.main()
