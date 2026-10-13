package ru.sberbank.avatar.reports;

import java.awt.Color;
import java.awt.Font;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.text.DecimalFormat;

import net.sf.jasperreports.engine.JRAbstractChartCustomizer;
import net.sf.jasperreports.engine.JRChart;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.annotations.CategoryTextAnnotation;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.labels.CategoryItemLabelGenerator;
import org.jfree.chart.labels.ItemLabelAnchor;
import org.jfree.chart.labels.ItemLabelPosition;
import org.jfree.chart.labels.StandardCategoryItemLabelGenerator;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.PiePlot;
import org.jfree.chart.renderer.category.BarRenderer;
import org.jfree.chart.renderer.category.CategoryItemRenderer;
import org.jfree.chart.renderer.category.LineAndShapeRenderer;
import org.jfree.chart.renderer.category.StackedBarRenderer;
import org.jfree.data.category.CategoryDataset;
import org.jfree.data.general.PieDataset;

/** Applies shared blue colors and chart labels across JasperReports/JFreeChart versions. */
public final class AnalyticsChartCustomizer extends JRAbstractChartCustomizer {
    private static final Color[] BLUE = {
        Color.decode("#1557A0"), Color.decode("#2878B8"), Color.decode("#4A98D2"),
        Color.decode("#83B7E2"), Color.decode("#C3DDF1")
    };
    private static final Color GRID = Color.decode("#DCE6EF");
    private static final Color LABEL = Color.decode("#52616E");

    @Override
    public void customize(JFreeChart chart, JRChart jasperChart) {
        if (chart.getPlot() instanceof PiePlot) {
            customizePie((PiePlot) chart.getPlot());
            return;
        }
        if (chart.getPlot() instanceof CategoryPlot) {
            customizeCategory((CategoryPlot) chart.getPlot());
        }
    }

    private void customizePie(PiePlot plot) {
        PieDataset dataset = plot.getDataset();
        for (int index = 0; index < dataset.getItemCount(); index++) {
            plot.setSectionPaint(dataset.getKey(index), BLUE[index % BLUE.length]);
        }
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setLabelPaint(LABEL);
        plot.setLabelBackgroundPaint(new Color(255, 255, 255, 220));
        plot.setLabelFont(new Font("Arial", Font.PLAIN, 9));
    }

    private void customizeCategory(CategoryPlot plot) {
        plot.setBackgroundPaint(Color.WHITE);
        plot.setRangeGridlinePaint(GRID);
        plot.setOutlineVisible(false);
        CategoryDataset dataset = plot.getDataset();
        CategoryItemRenderer renderer = plot.getRenderer();
        if (dataset == null || renderer == null) {
            return;
        }
        for (int index = 0; index < dataset.getRowCount(); index++) {
            renderer.setSeriesPaint(index, BLUE[index % BLUE.length]);
        }

        CategoryAxis axis = plot.getDomainAxis();
        if (axis != null) {
            axis.setCategoryLabelPositions(dataset.getColumnCount() > 16
                ? CategoryLabelPositions.UP_45 : CategoryLabelPositions.STANDARD);
        }

        if (renderer instanceof StackedBarRenderer) {
            configureItemLabels(renderer, dataset.getRowCount(), new StandardCategoryItemLabelGenerator(),
                labelPosition(ItemLabelAnchor.CENTER, "CENTER"));
            addStackedTotals(plot, dataset);
        } else if (renderer instanceof BarRenderer) {
            configureItemLabels(renderer, dataset.getRowCount(), new StandardCategoryItemLabelGenerator(),
                labelPosition(ItemLabelAnchor.OUTSIDE12, "BOTTOM_CENTER"));
        } else if (renderer instanceof LineAndShapeRenderer && dataset.getRowCount() == 1) {
            addLinePointLabels(plot, dataset);
        }
    }

    private void addLinePointLabels(CategoryPlot plot, CategoryDataset dataset) {
        double max = 0;
        int count = dataset.getColumnCount();
        int step = count > 16 ? (int) Math.ceil(count / 10.0) : 1;
        DecimalFormat format = new DecimalFormat("#,##0");
        for (int column = 0; column < count; column++) {
            Number value = dataset.getValue(0, column);
            if (value == null) {
                continue;
            }
            max = Math.max(max, value.doubleValue());
            if (column % step != 0 && column != count - 1) {
                continue;
            }
            CategoryTextAnnotation annotation = new CategoryTextAnnotation(
                format.format(value), dataset.getColumnKey(column),
                value.doubleValue() + Math.max(0.2, max * 0.08));
            annotation.setCategoryAnchor(org.jfree.chart.axis.CategoryAnchor.MIDDLE);
            annotation.setFont(new Font("Arial", Font.BOLD, 9));
            annotation.setPaint(LABEL);
            setTextAnchor(annotation, "BOTTOM_CENTER");
            plot.addAnnotation(annotation);
        }
        if (plot.getRangeAxis() != null) {
            plot.getRangeAxis().setAutoRange(false);
            plot.getRangeAxis().setRange(0, Math.max(1, max * 1.5));
        }
    }

    private void addStackedTotals(CategoryPlot plot, CategoryDataset dataset) {
        double max = 0;
        DecimalFormat format = new DecimalFormat("#,##0");
        for (int column = 0; column < dataset.getColumnCount(); column++) {
            double total = 0;
            for (int row = 0; row < dataset.getRowCount(); row++) {
                Number value = dataset.getValue(row, column);
                if (value != null) {
                    total += value.doubleValue();
                }
            }
            max = Math.max(max, total);
            CategoryTextAnnotation annotation = new CategoryTextAnnotation(
                format.format(total), dataset.getColumnKey(column), total);
            annotation.setCategoryAnchor(org.jfree.chart.axis.CategoryAnchor.MIDDLE);
            annotation.setFont(new Font("Arial", Font.BOLD, 9));
            annotation.setPaint(LABEL);
            setTextAnchor(annotation, "BOTTOM_CENTER");
            plot.addAnnotation(annotation);
        }
        if (plot.getRangeAxis() != null) {
            plot.getRangeAxis().setAutoRange(false);
            plot.getRangeAxis().setRange(0, Math.max(1, max * 1.5));
        }
    }

    private void configureItemLabels(CategoryItemRenderer renderer, int seriesCount,
                                     CategoryItemLabelGenerator generator,
                                     ItemLabelPosition position) {
        invokeFirst(renderer, new String[] {"setDefaultItemLabelsVisible", "setItemLabelsVisible"},
            new Class<?>[] {boolean.class}, true);
        invokeFirst(renderer, new String[] {"setDefaultItemLabelGenerator", "setBaseItemLabelGenerator"},
            new Class<?>[] {CategoryItemLabelGenerator.class}, generator);
        invokeFirst(renderer, new String[] {"setDefaultPositiveItemLabelPosition", "setPositiveItemLabelPosition"},
            new Class<?>[] {ItemLabelPosition.class}, position);
        for (int series = 0; series < seriesCount; series++) {
            invokeFirst(renderer, new String[] {"setSeriesItemLabelsVisible"},
                new Class<?>[] {int.class, boolean.class}, series, true);
            invokeFirst(renderer, new String[] {"setSeriesItemLabelGenerator"},
                new Class<?>[] {int.class, CategoryItemLabelGenerator.class}, series, generator);
            invokeFirst(renderer, new String[] {"setSeriesPositiveItemLabelPosition"},
                new Class<?>[] {int.class, ItemLabelPosition.class}, series, position);
        }
    }

    private ItemLabelPosition labelPosition(ItemLabelAnchor anchor, String textAnchorName) {
        try {
            Class<?> textAnchorClass = textAnchorClass();
            Constructor<?> constructor = ItemLabelPosition.class.getConstructor(ItemLabelAnchor.class, textAnchorClass);
            return (ItemLabelPosition) constructor.newInstance(anchor, textAnchor(textAnchorClass, textAnchorName));
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("Unsupported JFreeChart item-label API", exception);
        }
    }

    private void setTextAnchor(CategoryTextAnnotation annotation, String textAnchorName) {
        try {
            Class<?> textAnchorClass = textAnchorClass();
            Method method = annotation.getClass().getMethod("setTextAnchor", textAnchorClass);
            method.invoke(annotation, textAnchor(textAnchorClass, textAnchorName));
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException("Unsupported JFreeChart annotation API", exception);
        }
    }

    private Class<?> textAnchorClass() throws ClassNotFoundException {
        try {
            return Class.forName("org.jfree.chart.ui.TextAnchor");
        } catch (ClassNotFoundException oldPackage) {
            return Class.forName("org.jfree.ui.TextAnchor");
        }
    }

    private Object textAnchor(Class<?> anchorClass, String name) throws ReflectiveOperationException {
        Field field = anchorClass.getField(name);
        return field.get(null);
    }

    private void invokeFirst(Object target, String[] methodNames, Class<?>[] parameterTypes, Object... arguments) {
        for (String methodName : methodNames) {
            try {
                Method method = target.getClass().getMethod(methodName, parameterTypes);
                method.invoke(target, arguments);
                return;
            } catch (NoSuchMethodException ignored) {
                // The renderer API renamed these methods between JFreeChart 1.0 and 1.5.
            } catch (IllegalAccessException | InvocationTargetException exception) {
                throw new IllegalStateException("Unable to configure JFreeChart labels", exception);
            }
        }
        throw new IllegalStateException("Unsupported JFreeChart renderer label API");
    }
}
