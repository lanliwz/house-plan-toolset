import unittest

from house_landscape_planner.analysis.parcel import compute_metrics


class ParcelAnalysisTest(unittest.TestCase):
    def test_rectangle_metrics_are_stable(self) -> None:
        points = [
            (0.0, 0.0),
            (20.0, 0.0),
            (20.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]

        metrics = compute_metrics(points)

        self.assertEqual(round(metrics.area, 3), 200.0)
        self.assertEqual(round(metrics.perimeter, 3), 60.0)
        self.assertEqual(round(metrics.centroid_x, 3), 10.0)
        self.assertEqual(round(metrics.centroid_y, 3), 5.0)
        self.assertEqual(round(metrics.aspect_ratio, 3), 2.0)
        self.assertEqual(metrics.vertex_count, 4)

    def test_irregular_shape_scores_above_rectangle(self) -> None:
        rectangle = [
            (0.0, 0.0),
            (20.0, 0.0),
            (20.0, 10.0),
            (0.0, 10.0),
            (0.0, 0.0),
        ]
        irregular = [
            (0.0, 0.0),
            (24.0, 0.0),
            (24.0, 3.0),
            (12.0, 3.0),
            (12.0, 12.0),
            (24.0, 12.0),
            (24.0, 15.0),
            (0.0, 15.0),
            (0.0, 0.0),
        ]

        rectangle_metrics = compute_metrics(rectangle)
        irregular_metrics = compute_metrics(irregular)

        self.assertGreater(
            irregular_metrics.irregularity_index,
            rectangle_metrics.irregularity_index,
        )


if __name__ == "__main__":
    unittest.main()
